export type ClipKind = 'story' | 'reel';

export type ClipSocialCounts = {
  reactions: number;
  comments: number;
};

/** Check-in proof posts are never Waves or Rounds. */
export function isClipSocialPost(post: {
  source?: string | null;
  checkin_id?: string | null;
} | null | undefined): boolean {
  if (!post) {
    return false;
  }
  if (post.source === 'checkin' || Boolean(post.checkin_id)) {
    return false;
  }
  return true;
}

export function clipSocialCounts(post: {
  reactions?: unknown[] | null;
  comments?: unknown[] | null;
} | null | undefined): ClipSocialCounts {
  return {
    reactions: post?.reactions?.length ?? 0,
    comments: post?.comments?.length ?? 0,
  };
}

export function clipPostsQueryKey(ids: string[]) {
  return ['feed', 'clips', [...new Set(ids.filter(Boolean))].sort().join(',')] as const;
}
