import { displayReactionType } from '@/lib/reactions';
import { personDisplayName } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import type { PublicProfile } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

export type WhoReactedPerson = {
  userId: string;
  username: string | null;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
};

/** laugh rows may still be stored as `care`. */
export function whoReactedTypeFilter(type: string): string[] {
  const next = displayReactionType(type);
  return next === 'laugh' ? ['laugh', 'care'] : [next];
}

/**
 * Who reacted, newest first.
 * reactions: user_id, created_at, reaction_type
 *   eq post_id + comment_id is null  OR  eq comment_id
 *   in reaction_type (laugh also includes care)
 *   order created_at desc
 * then profiles: id, username, display_name, avatar_url
 */
export async function fetchWhoReacted(input: {
  postId: string;
  commentId?: string | null;
  type: string;
}): Promise<WhoReactedPerson[]> {
  const types = whoReactedTypeFilter(input.type);
  let query = supabase
    .from('reactions')
    .select('user_id, created_at, reaction_type')
    .in('reaction_type', types)
    .order('created_at', { ascending: false });

  if (input.commentId) {
    query = query.eq('comment_id', input.commentId);
  } else {
    query = query.eq('post_id', input.postId).is('comment_id', null);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(getErrorMessage(error));
  }

  const rows = (data ?? []).filter((row) => row?.user_id);
  const userIds = [...new Set(rows.map((row) => String(row.user_id)))];
  if (userIds.length === 0) {
    return [];
  }

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', userIds);
  if (profileError) {
    throw new Error(getErrorMessage(profileError));
  }

  const byId = new Map(
    ((profiles ?? []) as Pick<PublicProfile, 'id' | 'username' | 'display_name' | 'avatar_url'>[]).map(
      (profile) => [profile.id, profile],
    ),
  );

  return rows.map((row) => {
    const profile = byId.get(String(row.user_id));
    return {
      userId: String(row.user_id),
      username: profile?.username ?? null,
      displayName: personDisplayName(profile) || 'Someone',
      avatarUrl: profile?.avatar_url ?? null,
      createdAt: String(row.created_at ?? ''),
    };
  });
}
