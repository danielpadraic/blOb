import { useQuery } from '@tanstack/react-query';

import { displayReactionType } from '@/lib/reactions';
import { fetchWhoReacted } from '@/lib/whoReacted';

export function whoReactedQueryKey(
  postId: string,
  commentId: string | null | undefined,
  type: string,
) {
  return ['who-reacted', postId, commentId ?? '', displayReactionType(type)] as const;
}

export function useWhoReacted(
  enabled: boolean,
  postId: string | undefined,
  commentId: string | null | undefined,
  type: string,
) {
  return useQuery({
    queryKey: whoReactedQueryKey(postId ?? '', commentId, type),
    enabled: enabled && Boolean(postId || commentId),
    queryFn: () =>
      fetchWhoReacted({
        postId: postId ?? '',
        commentId,
        type,
      }),
  });
}
