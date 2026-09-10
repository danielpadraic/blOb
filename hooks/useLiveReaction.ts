import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';
import { Alert } from 'react-native';

import { findCachedFeedPost, patchFeedPosts } from '@/hooks/useFeed';
import { applyLiveReactionAction } from '@/lib/liveThread';
import {
  displayReactionType,
  findUserReactionOfType,
  markOptimisticReactionWrite,
  reactionFlightKey,
  reactionSetKey,
} from '@/lib/reactions';
import { supabase } from '@/lib/supabase';
import type { PostWithMeta, Reaction, ReactionType } from '@/lib/types';
import { useAuth } from '@/hooks/useAuth';
import { getErrorMessage } from '@/utils/errors';

const REACTION_COLUMNS = 'id, user_id, post_id, comment_id, reaction_type, created_at';

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

async function deleteReaction(input: {
  userId: string;
  postId: string;
  commentId?: string | null;
  type: string;
  existingId?: string | null;
}) {
  if (input.existingId && isPersistedId(input.existingId)) {
    const { error } = await supabase.from('reactions').delete().eq('id', input.existingId);
    if (error) {
      throw new Error(getErrorMessage(error));
    }
    return;
  }
  let query = supabase
    .from('reactions')
    .delete()
    .eq('user_id', input.userId)
    .eq('reaction_type', input.type);
  query = input.commentId
    ? query.eq('comment_id', input.commentId)
    : query.eq('post_id', input.postId);
  const { error } = await query;
  if (error) {
    throw new Error(getErrorMessage(error));
  }
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
      const nextType = displayReactionType(input.type);
      if (input.action === 'remove') {
        await deleteReaction({
          userId: user.id,
          postId: input.post.id,
          commentId: input.commentId,
          type: nextType,
          existingId: input.existingId,
        });
        return { action: 'removed' as const };
      }
      const inserted = input.commentId
        ? await supabase
            .from('reactions')
            .insert({
              user_id: user.id,
              comment_id: input.commentId,
              reaction_type: nextType,
            })
            .select(REACTION_COLUMNS)
            .single()
        : await supabase
            .from('reactions')
            .insert({
              user_id: user.id,
              post_id: input.post.id,
              reaction_type: nextType,
            })
            .select(REACTION_COLUMNS)
            .single();
      if (inserted.error) {
        throw new Error(getErrorMessage(inserted.error));
      }
      return { action: 'added' as const, reaction: inserted.data as Reaction };
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
    onError: (error, _input, context) => {
      for (const [key, data] of context?.previous ?? []) {
        queryClient.setQueryData(key, data);
      }
      Alert.alert('Couldn’t react.', getErrorMessage(error));
    },
  });

  startRef.current = (input: PublicToggleInput) => {
    if (!user) {
      return;
    }
    const key = reactionFlightKey(input.post.id, input.commentId, input.type);
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
