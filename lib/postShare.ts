import * as Linking from 'expo-linking';

export function postPath(postId: string) {
  return `/feed/p/${postId}` as const;
}

export function postHref(postId: string) {
  return {
    pathname: '/feed/p/[id]' as const,
    params: { id: postId },
  };
}

export function postShareUrl(postId: string) {
  return Linking.createURL(`feed/p/${postId}`);
}
