import { useEffect, useState } from 'react';

import { useCreateComment, useCreatePost, usePost, useToggleReaction } from '@/hooks/useFeed';
import { attachClipPostId } from '@/lib/social';
import { isClipSocialPost, type ClipKind } from '@/lib/clipPost';
import type { PostWithMeta, ReactionType } from '@/lib/types';

type ClipSocialInput = {
  kind: ClipKind;
  clipId: string;
  postId?: string | null;
  mediaUrl: string;
  caption?: string | null;
  challengeId?: string | null;
  type?: 'wave' | 'round';
};

function asMeta(post: PostWithMeta | { id: string }): PostWithMeta {
  const row = post as PostWithMeta;
  return {
    ...row,
    comments: row.comments ?? [],
    reactions: row.reactions ?? [],
  };
}

export function useClipSocial(input: ClipSocialInput) {
  const [linkedId, setLinkedId] = useState(input.postId ?? null);
  const postQuery = usePost(linkedId);
  const createPost = useCreatePost();
  const toggleReaction = useToggleReaction();
  const createComment = useCreateComment();

  useEffect(() => {
    if (input.postId) {
      setLinkedId(input.postId);
    }
  }, [input.postId]);

  const post =
    postQuery.data && isClipSocialPost(postQuery.data) ? postQuery.data : null;

  async function ensurePost(): Promise<PostWithMeta | null> {
    if (post) {
      return post;
    }
    const created = await createPost.mutateAsync({
      content: input.caption?.trim() || '',
      mediaUrls: input.mediaUrl ? [input.mediaUrl] : [],
      challengeId: input.challengeId ?? undefined,
      source: 'feed',
      type: input.type ?? (input.kind === 'reel' ? 'round' : 'wave'),
    });
    await attachClipPostId(input.kind, input.clipId, created.id);
    setLinkedId(created.id);
    return asMeta(created as PostWithMeta);
  }

  return {
    post,
    commenting: createComment.isPending,
    onReact: async (type: ReactionType, commentId?: string | null) => {
      const target = post ?? (await ensurePost());
      if (!target) {
        return;
      }
      toggleReaction.mutate({ post: target, type, commentId });
    },
    onComment: async (content: string, parentId?: string | null, mentionedUserIds?: string[]) => {
      const target = post ?? (await ensurePost());
      if (!target) {
        return;
      }
      await createComment.mutateAsync({
        postId: target.id,
        content,
        parentId,
        mentionedUserIds,
      });
    },
  };
}
