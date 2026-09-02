import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { useFollowing, useFriends } from '@/hooks/useSocial';
import { searchMentionCircles } from '@/lib/circles';
import { isCreatorAccount } from '@/lib/creator';
import { mentionSearchMatches, type MentionKind } from '@/lib/mentions';
import { asPostAudience, type PostAudience } from '@/lib/postAudience';
import { fetchPublicProfilesByIds, searchPeople } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { PublicProfile } from '@/lib/types';

export type MentionCandidate = {
  id: string;
  kind: MentionKind;
  label: string;
  subtitle?: string;
  avatarUrl?: string | null;
  username: string;
  rank: 'friend' | 'creator' | 'search' | 'audience' | 'challenge' | 'circle';
};

export function useMentionCandidates(input: {
  query: string;
  audience: PostAudience | string;
  audienceUserIds: string[];
  /** Extra people to include (Live/Circle members) without replacing Home search. */
  memberIds?: string[];
  excludeIds?: string[];
  enabled?: boolean;
}) {
  const { user } = useAuth();
  const pickerOpen = input.enabled !== false;
  const friends = useFriends(undefined, { enabled: pickerOpen });
  const following = useFollowing(user?.id, { enabled: pickerOpen });
  const audience = asPostAudience(input.audience);
  const rawQuery = input.query.trim().replace(/^@/, '').toLowerCase();
  const [query, setQuery] = useState(rawQuery);
  useEffect(() => {
    if (!rawQuery) {
      setQuery('');
      return;
    }
    const handle = setTimeout(() => setQuery(rawQuery), 180);
    return () => clearTimeout(handle);
  }, [rawQuery]);

  const blocked = useQuery({
    queryKey: ['blocked-ids', user?.id],
    enabled: Boolean(user?.id && pickerOpen),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('friendships')
        .select('user_a_id, user_b_id, status')
        .eq('status', 'blocked')
        .or(`user_a_id.eq.${user!.id},user_b_id.eq.${user!.id}`);
      if (error) {
        return new Set<string>();
      }
      const ids = new Set<string>();
      for (const row of data ?? []) {
        ids.add(row.user_a_id === user!.id ? row.user_b_id : row.user_a_id);
      }
      return ids;
    },
  });

  const searched = useQuery({
    queryKey: ['mention-search', user?.id, query],
    enabled: Boolean(user?.id && pickerOpen && query.length >= 2 && input.audienceUserIds.length === 0),
    staleTime: 30_000,
    queryFn: () => searchPeople(query, user!.id),
  });

  const challenges = useQuery({
    queryKey: ['mention-challenges', user?.id, query],
    enabled: Boolean(user?.id && pickerOpen && query.length >= 2 && input.audienceUserIds.length === 0),
    staleTime: 30_000,
    queryFn: async () => {
      const safe = query.replace(/[%_,]/g, '').slice(0, 40);
      if (!safe) {
        return [] as { id: string; title: string | null; task: string | null }[];
      }
      const { data, error } = await supabase
        .from('challenges')
        .select('id, title, task')
        .or(`title.ilike.%${safe}%,task.ilike.%${safe}%`)
        .limit(8);
      if (error) {
        return [];
      }
      return data ?? [];
    },
  });

  const circles = useQuery({
    queryKey: ['mention-circles', user?.id, query],
    enabled: Boolean(user?.id && pickerOpen && query.length >= 2 && input.audienceUserIds.length === 0),
    staleTime: 30_000,
    queryFn: () => searchMentionCircles(query, user!.id),
  });

  const scoped = useQuery({
    queryKey: ['mention-audience', [...input.audienceUserIds].sort().join(',')],
    enabled: Boolean(pickerOpen && input.audienceUserIds.length > 0),
    staleTime: 30_000,
    queryFn: () => fetchPublicProfilesByIds(input.audienceUserIds),
  });

  const memberIds = input.memberIds ?? [];
  const members = useQuery({
    queryKey: ['mention-members', [...memberIds].sort().join(',')],
    enabled: Boolean(pickerOpen && memberIds.length > 0 && input.audienceUserIds.length === 0),
    staleTime: 30_000,
    queryFn: () => fetchPublicProfilesByIds(memberIds),
  });

  const rows = useMemo(() => {
    const blockedIds = blocked.data ?? new Set<string>();
    const exclude = new Set(input.excludeIds ?? []);
    if (user?.id) {
      exclude.add(user.id);
    }
    const friendProfiles = (friends.data ?? [])
      .map((row) => row.profile)
      .filter((profile): profile is PublicProfile => Boolean(profile?.id));
    const creatorProfiles = (following.data ?? [])
      .map((row) => row.profile)
      .filter((profile): profile is PublicProfile => Boolean(profile?.id && isCreatorAccount(profile)));

    const seen = new Set<string>();
    const out: MentionCandidate[] = [];

    function take(profile: PublicProfile, rank: MentionCandidate['rank']) {
      if (!profile.id || seen.has(profile.id) || exclude.has(profile.id) || blockedIds.has(profile.id)) {
        return;
      }
      if (audience === 'only_me') {
        return;
      }
      if (audience === 'friends' && rank !== 'friend' && rank !== 'audience') {
        return;
      }
      if (audience === 'specific' && rank !== 'audience' && !input.audienceUserIds.includes(profile.id)) {
        return;
      }
      if (query && !mentionSearchMatches(profile, query)) {
        return;
      }
      seen.add(profile.id);
      out.push({
        id: profile.id,
        kind: 'user',
        label: profile.display_name?.trim() || profile.username,
        subtitle: profile.username ? `@${profile.username}` : undefined,
        avatarUrl: profile.avatar_url,
        username: profile.username,
        rank,
      });
    }

    if (input.audienceUserIds.length > 0) {
      for (const profile of scoped.data ?? []) {
        take(profile, 'audience');
      }
      return out;
    }

    for (const profile of members.data ?? []) {
      take(profile, 'audience');
    }
    for (const profile of friendProfiles) {
      take(profile, 'friend');
    }
    for (const profile of creatorProfiles) {
      take(profile, 'creator');
    }
    for (const profile of searched.data ?? []) {
      take(profile, 'search');
    }
    if (query.length >= 2) {
      for (const row of challenges.data ?? []) {
        const title = String(row.title ?? '').trim() || 'Challenge';
        if (seen.has(row.id)) {
          continue;
        }
        seen.add(row.id);
        out.push({
          id: row.id,
          kind: 'challenge',
          label: title,
          subtitle: String(row.task ?? '').trim() || undefined,
          username: title,
          rank: 'challenge',
        });
      }
      for (const row of circles.data ?? []) {
        if (seen.has(row.id)) {
          continue;
        }
        seen.add(row.id);
        out.push({
          id: row.id,
          kind: 'circle',
          label: row.name,
          subtitle: row.focus || undefined,
          username: row.name,
          rank: 'circle',
        });
      }
    }
    return out;
  }, [
    audience,
    blocked.data,
    challenges.data,
    circles.data,
    following.data,
    friends.data,
    input.audienceUserIds,
    input.excludeIds,
    members.data,
    query,
    scoped.data,
    searched.data,
    user?.id,
  ]);

  return {
    data: rows,
    isLoading:
      pickerOpen &&
      (input.audienceUserIds.length > 0 ? scoped.isLoading : friends.isLoading || following.isLoading),
  };
}
