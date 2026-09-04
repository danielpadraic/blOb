import * as Linking from 'expo-linking';

export function postPath(postId: string) {
  return `/feed/p/${postId}` as const;
}

export function postHref(postId: string, extra?: { commentId?: string | null; comments?: boolean }) {
  const commentId = String(extra?.commentId ?? '').trim();
  const params: { id: string; comments?: string; commentId?: string } = { id: postId };
  if (extra?.comments || commentId) {
    params.comments = '1';
  }
  if (commentId) {
    params.commentId = commentId;
  }
  return {
    pathname: '/feed/p/[id]' as const,
    params,
  };
}

export function postShareUrl(postId: string) {
  return Linking.createURL(`feed/p/${postId}`);
}
