import { DEFAULT_POST_AUDIENCE, viewerCanSeeHomePost, type PostAudience } from '@/lib/postAudience';

export type ClipLinkedPost = {
  id: string;
  author_id?: string | null;
  user_id?: string | null;
  audience?: string | null;
  audience_user_ids?: string[] | null;
  type?: string | null;
};

/** Missing linked post → Friends. Never treat a forgotten row as public. */
export function clipAudienceOrFriends(value: unknown): PostAudience {
  if (value == null || value === '') {
    return DEFAULT_POST_AUDIENCE;
  }
  return value === 'people' || value === 'public' || value === 'friends' || value === 'specific' || value === 'only_me'
    ? (value === 'people' ? 'specific' : value)
    : DEFAULT_POST_AUDIENCE;
}

export function viewerCanSeeClip(input: {
  viewerId?: string | null;
  authorId: string;
  audience?: unknown;
  audienceUserIds?: string[] | null;
  friendsWithAuthor: boolean;
  officialAuthor?: boolean;
}): boolean {
  return viewerCanSeeHomePost({
    viewerId: input.viewerId,
    authorId: input.authorId,
    audience: clipAudienceOrFriends(input.audience),
    audienceUserIds: input.audienceUserIds,
    friendsWithAuthor: input.friendsWithAuthor,
    officialAuthor: input.officialAuthor,
  });
}

export function filterClipsByAudience<T extends { user_id: string; post_id?: string | null }>(
  clips: T[],
  ctx: {
    viewerId?: string | null;
    posts: Map<string, ClipLinkedPost>;
    friendIds: Set<string>;
    officialAuthorIds: Set<string>;
  },
): T[] {
  return clips.filter((clip) => {
    const post = clip.post_id ? ctx.posts.get(clip.post_id) : undefined;
    return viewerCanSeeClip({
      viewerId: ctx.viewerId,
      authorId: clip.user_id,
      audience: post?.audience,
      audienceUserIds: post?.audience_user_ids,
      friendsWithAuthor: Boolean(ctx.viewerId && ctx.friendIds.has(clip.user_id)),
      officialAuthor: ctx.officialAuthorIds.has(clip.user_id),
    });
  });
}
