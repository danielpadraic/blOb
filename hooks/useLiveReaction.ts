import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { Alert } from 'react-native';

import { findCachedFeedPost, patchFeedPosts } from '@/hooks/useFeed';
import { applyLiveReactionAction } from '@/lib/liveThread';
import {
  findUserReactionOfType,
  markOptimisticReactionWrite,
  reactionFlightKey,
  reactionSetKey,
} from '@/lib/reactions';
import {
  deleteReactionRow,
  REACT_FAIL_COPY,
  reactionWriteIsAlreadyOn,
  upsertReactionRow,
} from '@/lib/reactionWrite';
import type { PostWithMeta, Reaction, ReactionType } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';

type ToggleLiveReactionInput = {
  post: PostWithMeta;
  type: ReactionType;
  commentId?: string | null;
  action: 'add' | 'remove';
  existingId?: string | null;
};

type PublicToggleInput = {
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

function isPersistedId(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/** Live + Circles: stack types. Same type again clears only that type. */
export function useToggleLiveReaction() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const flights = useRef(new Map<string, { queuedInverse: boolean }>());
  const startRef = useRef<(input: PublicToggleInput) => void>(() => undefined);

  const mutation = useMutation({
    mutationFn: async (input: ToggleLiveReactionInput) => {
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      if (input.action === 'remove') {
        await deleteReactionRow({
          userId: user.id,
          postId: input.post.id,
          commentId: input.commentId,
          type: input.type,
          existingId: input.existingId,
        });
        return { action: 'removed' as const };
      }
      try {
        const reaction = await upsertReactionRow({
          userId: user.id,
          postId: input.post.id,
          commentId: input.commentId,
          type: input.type,
        });
        return { action: 'added' as const, reaction };
      } catch (error) {
        if (reactionWriteIsAlreadyOn(error)) {
          return {
            action: 'added' as const,
            reaction: {
              id: `existing-${input.type}-${input.commentId ?? input.post.id}-${user.id}`,
              user_id: user.id,
              post_id: input.commentId ? null : input.post.id,
              comment_id: input.commentId ?? null,
              reaction_type: input.type,
              created_at: new Date().toISOString(),
            } satisfies Reaction,
          };
        }
        throw error;
      }
    },
    onMutate: (input) => {
      if (!user) {
        return;
      }
      const previous = [
        ...queryClient.getQueriesData({ queryKey: ['feed'] }),
        ...queryClient.getQueriesData({ queryKey: ['live'] }),
      ];
      markOptimisticReactionWrite(
        reactionSetKey({
          postId: input.commentId ? null : input.post.id,
          commentId: input.commentId,
          userId: user.id,
          type: input.type,
        }),
      );
      patchFeedPosts(queryClient, input.post.id, (post) =>
        applyLiveReactionAction(post, input.action, user.id, input.type, input.commentId),
      );
      return { previous };
    },
    onSuccess: (result, input) => {
      if (!user || result.action !== 'added') {
        return;
      }
      patchFeedPosts(queryClient, input.post.id, (post) =>
        applyLiveReactionAction(post, 'add', user.id, input.type, input.commentId, result.reaction),
      );
    },
    onError: (error, input, context) => {
      if (user && reactionWriteIsAlreadyOn(error)) {
        patchFeedPosts(queryClient, input.post.id, (post) =>
          applyLiveReactionAction(post, 'add', user.id, input.type, input.commentId),
        );
        return;
      }
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data);
      }
      Alert.alert(REACT_FAIL_COPY);
    },
  });

  startRef.current = (input: PublicToggleInput) => {
    if (!user) {
      return;
    }
    const key = reactionFlightKey(input.post.id, input.commentId, user.id, input.type);
    const flight = flights.current.get(key);
    if (flight) {
      flight.queuedInverse = !flight.queuedInverse;
      return;
    }
    const cached = findCachedFeedPost(queryClient, input.post.id) ?? input.post;
    const mine = findUserReactionOfType(poolFor(cached, input.commentId), user.id, input.type);
    const action = mine ? ('remove' as const) : ('add' as const);
    const entry = { queuedInverse: false };
    flights.current.set(key, entry);
    mutation.mutate(
      {
        ...input,
        action,
        existingId: mine && isPersistedId(mine.id) ? mine.id : null,
      },
      {
        onSettled: (_data, error) => {
          flights.current.delete(key);
          if (error || !entry.queuedInverse) {
            return;
          }
          startRef.current(input);
        },
      },
    );
  };

  return {
    ...mutation,
    mutate(input: PublicToggleInput) {
      startRef.current(input);
    },
  };
}
