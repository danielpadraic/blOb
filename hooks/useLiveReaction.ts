import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { Alert } from 'react-native';

import { patchFeedPosts } from '@/hooks/useFeed';
import { applyLiveReaction } from '@/lib/liveThread';
import { asReactionType } from '@/lib/reactions';
import { supabase } from '@/lib/supabase';
import type { PostWithMeta, Reaction, ReactionType } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage, isReactionConflict } from '@/utils/errors';

const REACTION_COLUMNS = 'id, user_id, post_id, comment_id, reaction_type, created_at';

type ToggleLiveReactionInput = {
  post: PostWithMeta;
  type: ReactionType;
  commentId?: string | null;
};

function poolFor(post: PostWithMeta, commentId?: string | null): Reaction[] {
  if (!commentId) {
    return post.reactions ?? [];
  }
  return post.comments?.find((comment) => comment.id === commentId)?.reactions ?? [];
}

function findTypedReaction(
  post: PostWithMeta,
  userId: string,
  type: ReactionType,
  commentId?: string | null,
): Reaction | undefined {
  return poolFor(post, commentId).find(
    (row) => row.user_id === userId && asReactionType(row.reaction_type) === type,
  );
}

function isPersistedId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/** Live only: add or remove that type. Does not replace other types on the same row. */
export function useToggleLiveReaction() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const inflight = useRef(new Set<string>());
  const mutation = useMutation({
    mutationFn: async (input: ToggleLiveReactionInput) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      const existing = findTypedReaction(input.post, user.id, input.type, input.commentId);
      if (existing && isPersistedId(existing.id)) {
        const { error } = await supabase.from('reactions').delete().eq('id', existing.id);
        if (error) {
          throw new Error(getErrorMessage(error));
        }
        return { action: 'removed' as const };
      }
      const inserted = input.commentId
        ? await supabase
            .from('reactions')
            .insert({
              user_id: user.id,
              comment_id: input.commentId,
              reaction_type: input.type,
            })
            .select(REACTION_COLUMNS)
            .single()
        : await supabase
            .from('reactions')
            .insert({
              user_id: user.id,
              post_id: input.post.id,
              reaction_type: input.type,
            })
            .select(REACTION_COLUMNS)
            .single();
      if (inserted.error) {
        throw new Error(getErrorMessage(inserted.error));
      }
      return { action: 'added' as const, reaction: inserted.data as Reaction };
    },
    onMutate: async (input) => {
      if (!user) {
        return;
      }
      await queryClient.cancelQueries({ queryKey: ['feed'] });
      const previous = queryClient.getQueriesData({ queryKey: ['feed'] });
      patchFeedPosts(queryClient, input.post.id, (post) =>
        applyLiveReaction(post, user.id, input.type, input.commentId),
      );
      return { previous };
    },
    onError: (error, _input, context) => {
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data);
      }
      if (!isReactionConflict(error)) {
        Alert.alert('Couldn’t save reaction');
      }
    },
  });

  return {
    ...mutation,
    mutate(input: ToggleLiveReactionInput) {
      const guard = `${input.post.id}:${input.commentId ?? ''}:${input.type}`;
      if (inflight.current.has(guard)) {
        return;
      }
      inflight.current.add(guard);
      mutation.mutate(input, {
        onSettled: () => {
          inflight.current.delete(guard);
        },
      });
    },
  };
}
