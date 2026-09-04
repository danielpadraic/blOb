import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { mapFeedCache, patchFeedComments } from '@/hooks/useFeed';
import {
  commentHasStoredReplies,
  parseCommentEdits,
} from '@/lib/commentEdit';
import { mentionRecordsFromChips, type MentionChip } from '@/lib/mentions';
import { supabase } from '@/lib/supabase';
import { getErrorMessage, isMissingRelationError } from '@/utils/errors';

async function insertMentionRowsOnce(
  run: () => PromiseLike<{ error: { message?: string } | null }>,
) {
  let result = await run();
  if (result.error && !isMissingRelationError(result.error)) {
    result = await run();
  }
  if (result.error && !isMissingRelationError(result.error)) {
    throw new Error(getErrorMessage(result.error));
  }
}

async function replaceCommentMentions(
  commentId: string,
  authorId: string,
  mentionedUserIds?: string[],
) {
  const ids = [...new Set((mentionedUserIds ?? []).filter((id) => id && id !== authorId))];
  const existing = await supabase
    .from('comment_mentions')
    .select('id, mentioned_user_id')
    .eq('comment_id', commentId);
  if (existing.error && !isMissingRelationError(existing.error)) {
    throw new Error(getErrorMessage(existing.error));
  }
  const rows = existing.data ?? [];
  const keep = new Set(ids);
  const have = new Set(rows.map((row) => row.mentioned_user_id).filter(Boolean));
  const removeIds = rows
    .filter((row) => row.mentioned_user_id && !keep.has(row.mentioned_user_id))
    .map((row) => row.id);
  if (removeIds.length > 0) {
    const dropped = await supabase
      .from('comment_mentions')
      .delete()
      .in('id', removeIds)
      .eq('author_id', authorId);
    if (dropped.error && !isMissingRelationError(dropped.error)) {
      throw new Error(getErrorMessage(dropped.error));
    }
  }
  const add = ids.filter((id) => !have.has(id));
  if (add.length === 0) {
    return;
  }
  await insertMentionRowsOnce(() =>
    supabase.from('comment_mentions').insert(
      add.map((mentioned_user_id) => ({
        comment_id: commentId,
        mentioned_user_id,
        author_id: authorId,
      })),
    ),
  );
}

export function useCommentEdits(commentId?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['comment-edits', commentId, user?.id],
    enabled: Boolean(commentId && user?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('comment_edits')
        .select('body, created_at')
        .eq('comment_id', commentId as string)
        .order('created_at', { ascending: true });
      if (error) {
        throw new Error(getErrorMessage(error));
      }
      return parseCommentEdits(data);
    },
  });
}

export function useUpdateComment() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      commentId: string;
      content: string;
      mentionedUserIds?: string[];
      mentionChips?: MentionChip[];
    }) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      const prior = await supabase
        .from('comments')
        .select('id, post_id, author_id, content, edited_at, deleted_at')
        .eq('id', input.commentId)
        .eq('author_id', user.id)
        .maybeSingle();
      if (prior.error || !prior.data || prior.data.deleted_at) {
        throw new Error(getErrorMessage(prior.error) || 'Couldn’t save.');
      }
      if (prior.data.content === input.content) {
        await replaceCommentMentions(input.commentId, user.id, input.mentionedUserIds);
        return {
          ...prior.data,
          mentions: mentionRecordsFromChips(input.mentionChips),
        };
      }
      const now = new Date().toISOString();
      const updated = await supabase
        .from('comments')
        .update({
          content: input.content,
          edited_at: now,
        })
        .eq('id', input.commentId)
        .eq('author_id', user.id)
        .select('id, post_id, author_id, parent_id, content, created_at, edited_at, deleted_at')
        .single();
      if (updated.error || !updated.data) {
        throw new Error(getErrorMessage(updated.error) || 'Couldn’t save.');
      }
      try {
        await replaceCommentMentions(input.commentId, user.id, input.mentionedUserIds);
      } catch (error) {
        await supabase
          .from('comments')
          .update({
            content: prior.data.content,
            edited_at: prior.data.edited_at,
          })
          .eq('id', input.commentId)
          .eq('author_id', user.id);
        throw error;
      }
      return {
        ...updated.data,
        mentions: mentionRecordsFromChips(input.mentionChips),
      };
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['feed'] });
      const previous = queryClient.getQueriesData({ queryKey: ['feed'] });
      const now = new Date().toISOString();
      patchFeedComments(queryClient, input.commentId, (comment) => ({
        ...comment,
        content: input.content,
        edited_at: now,
        mentions: mentionRecordsFromChips(input.mentionChips).length
          ? mentionRecordsFromChips(input.mentionChips)
          : comment.mentions,
      }));
      return { previous };
    },
    onError: (_error, _input, context) => {
      for (const [queryKey, data] of context?.previous ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
    },
    onSuccess: (row) => {
      patchFeedComments(queryClient, row.id, (comment) => ({
        ...comment,
        content: row.content,
        edited_at: row.edited_at,
        mentions: row.mentions?.length ? row.mentions : comment.mentions,
      }));
      void queryClient.invalidateQueries({ queryKey: ['comment-edits', row.id] });
    },
  });
}

export function useDeleteComment() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: { commentId: string; postId: string }) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      const siblings = await supabase
        .from('comments')
        .select('id, parent_id, author_id, deleted_at')
        .eq('post_id', input.postId);
      if (siblings.error) {
        throw new Error(getErrorMessage(siblings.error) || 'Couldn’t remove.');
      }
      const rows = siblings.data ?? [];
      const target = rows.find((row) => row.id === input.commentId);
      if (!target || target.author_id !== user.id) {
        throw new Error('Couldn’t remove.');
      }
      const removedIds = [input.commentId];
      if (commentHasStoredReplies(rows, input.commentId)) {
        const now = new Date().toISOString();
        const soft = await supabase
          .from('comments')
          .update({ deleted_at: now })
          .eq('id', input.commentId)
          .eq('author_id', user.id)
          .select('id, deleted_at')
          .single();
        if (soft.error || !soft.data) {
          throw new Error(getErrorMessage(soft.error) || 'Couldn’t remove.');
        }
        return { mode: 'soft' as const, commentId: input.commentId, removedIds, deletedAt: now };
      }
      const hard = await supabase
        .from('comments')
        .delete()
        .eq('id', input.commentId)
        .eq('author_id', user.id);
      if (hard.error) {
        throw new Error(getErrorMessage(hard.error) || 'Couldn’t remove.');
      }
      let remaining = rows.filter((row) => row.id !== input.commentId);
      let parentId = target.parent_id ?? null;
      while (parentId) {
        const parent = remaining.find((row) => row.id === parentId);
        if (!parent?.deleted_at || parent.author_id !== user.id) {
          break;
        }
        if (commentHasStoredReplies(remaining, parent.id)) {
          break;
        }
        const prune = await supabase
          .from('comments')
          .delete()
          .eq('id', parent.id)
          .eq('author_id', user.id);
        if (prune.error) {
          break;
        }
        removedIds.push(parent.id);
        remaining = remaining.filter((row) => row.id !== parent.id);
        parentId = parent.parent_id ?? null;
      }
      return { mode: 'hard' as const, commentId: input.commentId, removedIds, deletedAt: null };
    },
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: ['feed'] });
      const previous = queryClient.getQueriesData({ queryKey: ['feed'] });
      const now = new Date().toISOString();
      queryClient.setQueriesData({ queryKey: ['feed'] }, (current) =>
        mapFeedCache(current, (posts) => {
          let changed = false;
          const next = posts.map((post) => {
            if (post.id !== input.postId) {
              return post;
            }
            const comments = post.comments ?? [];
            if (!comments.some((comment) => comment.id === input.commentId)) {
              return post;
            }
            changed = true;
            if (commentHasStoredReplies(comments, input.commentId)) {
              return {
                ...post,
                comments: comments.map((comment) =>
                  comment.id === input.commentId ? { ...comment, deleted_at: now } : comment,
                ),
              };
            }
            return {
              ...post,
              comments: comments.filter((comment) => comment.id !== input.commentId),
            };
          });
          return changed ? next : posts;
        }),
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      for (const [queryKey, data] of context?.previous ?? []) {
        queryClient.setQueryData(queryKey, data);
      }
    },
    onSuccess: (result) => {
      if (result.mode === 'soft') {
        patchFeedComments(queryClient, result.commentId, (comment) => ({
          ...comment,
          deleted_at: result.deletedAt,
        }));
        return;
      }
      for (const id of result.removedIds) {
        patchFeedComments(queryClient, id, () => null);
      }
    },
  });
}
