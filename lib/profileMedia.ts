import { isCheckinPost } from '@/lib/checkinPost';
import type { PostWithMeta } from '@/lib/types';
import { commentMediaUrls, mediaKind } from '@/utils/media';

export type ProfileMediaItem = {
  id: string;
  url: string;
  kind: 'image' | 'video';
  postId: string;
  owned: boolean;
  locked: boolean;
};

export function collectProfileMedia(
  posts: PostWithMeta[],
  ownerId: string,
  viewerId?: string | null,
): ProfileMediaItem[] {
  const items: ProfileMediaItem[] = [];
  const seen = new Set<string>();

  function push(url: string, post: PostWithMeta, owned: boolean) {
    const kind = mediaKind(url);
    if (kind !== 'image' && kind !== 'video') {
      return;
    }
    const key = `${post.id}:${url}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    items.push({
      id: key,
      url,
      kind,
      postId: post.id,
      owned,
      locked: Boolean(post.checkin_id) || isCheckinPost(post),
    });
  }

  for (const post of posts) {
    const ownsPost = post.author_id === ownerId;
    if (ownsPost) {
      for (const url of post.media_urls ?? []) {
        push(url, post, viewerId === ownerId);
      }
    }
    for (const comment of post.comments ?? []) {
      if (comment.author_id !== ownerId) {
        continue;
      }
      for (const url of commentMediaUrls(comment.content)) {
        push(url, post, viewerId === ownerId && ownsPost);
      }
    }
  }

  return items;
}
