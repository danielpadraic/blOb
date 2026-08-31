import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { useCreateComment, useCreatePost, usePost, useToggleReaction } from '@/hooks/useFeed';
import { attachClipPostId } from '@/lib/social';
import { isClipSocialPost, type ClipKind } from '@/lib/clipPost';
import { publishedRowId } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
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
  const sharesQuery = useQuery({
    queryKey: ['clip-shares', linkedId],
    enabled: Boolean(linkedId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('posts')
        .select('id, author_id, type')
        .eq('parent_id', linkedId as string)
        .in('type', ['round_share', 'wave_share']);
      if (error) {
        return [];
      }
      return (data ?? []) as Array<{ id: string; author_id: string; type: string }>;
    },
  });
  const shares = sharesQuery.data ?? [];

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
    const postedId = publishedRowId(created);
    const clipId = publishedRowId(input.clipId);
    if (!postedId || !clipId) {
      return null;
    }
    await attachClipPostId(input.kind, clipId, postedId);
    setLinkedId(postedId);
    return asMeta({ ...(created as PostWithMeta), id: postedId });
  }

  return {
    post,
    shares,
    shareCount: shares.length,
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
