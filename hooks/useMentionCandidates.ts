import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { useFollowing, useFriends } from '@/hooks/useSocial';
import { isCreatorAccount } from '@/lib/creator';
import { asPostAudience, type PostAudience } from '@/lib/postAudience';
import { searchPeople } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { PublicProfile } from '@/lib/types';

export type MentionCandidate = PublicProfile & { rank: 'friend' | 'creator' | 'search' };

export function useMentionCandidates(input: {
  query: string;
  audience: PostAudience | string;
  audienceUserIds: string[];
  excludeIds?: string[];
  enabled?: boolean;
}) {
  const { user } = useAuth();
  const friends = useFriends();
  const following = useFollowing(user?.id);
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
    enabled: Boolean(user?.id),
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
    enabled: Boolean(user?.id && input.enabled !== false && query.length > 0),
    staleTime: 30_000,
    queryFn: () => searchPeople(query, user!.id),
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
      if (audience === 'friends' && rank !== 'friend') {
        return;
      }
      if (audience === 'specific' && !input.audienceUserIds.includes(profile.id)) {
        return;
      }
      if (query && !matchesQuery(profile, query) && rank !== 'search') {
        return;
      }
      seen.add(profile.id);
      out.push({ ...profile, rank });
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
    return out;
  }, [
    audience,
    blocked.data,
    following.data,
    friends.data,
    input.audienceUserIds,
    input.excludeIds,
    query,
    searched.data,
    user?.id,
  ]);

  return {
    data: rows,
    isLoading: Boolean(input.enabled !== false) && (friends.isLoading || following.isLoading),
  };
}

function matchesQuery(profile: PublicProfile, query: string) {
  const username = profile.username?.toLowerCase() ?? '';
  const name = profile.display_name?.toLowerCase() ?? '';
  return username.includes(query) || name.includes(query);
}
