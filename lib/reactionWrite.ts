import { displayReactionType } from '@/lib/reactions';
import { supabase } from '@/lib/supabase';
import type { Reaction } from '@/lib/types';
import { isReactionConflict } from '@/utils/errors';

export const REACTION_COLUMNS = 'id, user_id, post_id, comment_id, reaction_type, created_at';

export const REACT_FAIL_COPY = 'Couldn’t react. Try again.';

function isPersistedId(id: string | null | undefined): boolean {
  return Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
}

function writeRow(input: {
  userId: string;
  postId?: string | null;
  commentId?: string | null;
  type: string;
}) {
  const reaction_type = displayReactionType(input.type);
  if (input.commentId) {
    return {
      user_id: input.userId,
      comment_id: input.commentId,
      reaction_type,
    };
  }
  return {
    user_id: input.userId,
    post_id: input.postId,
    reaction_type,
  };
}

export async function selectReactionRow(input: {
  userId: string;
  postId?: string | null;
  commentId?: string | null;
  type: string;
}): Promise<Reaction | null> {
  const reaction_type = displayReactionType(input.type);
  let query = supabase
    .from('reactions')
    .select(REACTION_COLUMNS)
    .eq('user_id', input.userId)
    .eq('reaction_type', reaction_type);
  query = input.commentId
    ? query.eq('comment_id', input.commentId)
    : query.eq('post_id', input.postId ?? '');
  const { data } = await query.maybeSingle();
  return (data as Reaction | null) ?? null;
}

function alreadyOnRow(input: {
  userId: string;
  postId?: string | null;
  commentId?: string | null;
  type: string;
}): Reaction {
  const reaction_type = displayReactionType(input.type);
  return {
    id: `existing-${reaction_type}-${input.commentId ?? input.postId ?? input.userId}-${input.userId}`,
    user_id: input.userId,
    post_id: input.commentId ? null : input.postId ?? null,
    comment_id: input.commentId ?? null,
    reaction_type,
    created_at: new Date().toISOString(),
  };
}

/**
 * Insert or no-op. ON CONFLICT (user, post|comment, type) DO NOTHING.
 * 23505 is already-on — never throw it.
 */
export async function upsertReactionRow(input: {
  userId: string;
  postId?: string | null;
  commentId?: string | null;
  type: string;
}): Promise<Reaction> {
  const row = writeRow(input);
  const onConflict = input.commentId
    ? 'user_id,comment_id,reaction_type'
    : 'user_id,post_id,reaction_type';
  const written = await supabase
    .from('reactions')
    .upsert(row, { onConflict, ignoreDuplicates: true })
    .select(REACTION_COLUMNS)
    .maybeSingle();
  if (written.data) {
    return written.data as Reaction;
  }
  if (written.error && !isReactionConflict(written.error) && written.error.code !== 'PGRST116') {
    const inserted = await supabase.from('reactions').insert(row).select(REACTION_COLUMNS).maybeSingle();
    if (inserted.data) {
      return inserted.data as Reaction;
    }
    if (inserted.error && !isReactionConflict(inserted.error)) {
      throw inserted.error;
    }
  }
  return (await selectReactionRow(input)) ?? alreadyOnRow(input);
}

export async function deleteReactionRow(input: {
  userId: string;
  postId?: string | null;
  commentId?: string | null;
  type: string;
  existingId?: string | null;
}): Promise<void> {
  if (isPersistedId(input.existingId)) {
    const { error } = await supabase.from('reactions').delete().eq('id', input.existingId);
    if (error) {
      throw error;
    }
    return;
  }
  let query = supabase
    .from('reactions')
    .delete()
    .eq('user_id', input.userId)
    .eq('reaction_type', displayReactionType(input.type));
  query = input.commentId
    ? query.eq('comment_id', input.commentId)
    : query.eq('post_id', input.postId ?? '');
  const { error } = await query;
  if (error) {
    throw error;
  }
}

/** 23505 / duplicate on this unique index is success, not a failed react. */
export function reactionWriteIsAlreadyOn(error: unknown): boolean {
  return isReactionConflict(error);
}
