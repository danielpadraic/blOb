import { isHomeExcludedClipType } from '@/lib/clipPost';
import { asCircleVisibility, viewerCanSeeHomeCirclePost } from '@/lib/circles';
import { asPostAudience, viewerCanSeeHomePost } from '@/lib/postAudience';

export const HOME_FEED_SPLASH_MS = 3000;
export const HOME_SATELLITE_MS = 2500;
export const HOME_PAGE_SIZE = 15;
export const HOME_PAGE_MIN = 12;
export const HOME_PAGE_MAX = 18;
/** Raw rows per source. Not 50 — first paint is one screen after filters. */
export const HOME_RAW_WINDOW = 24;
export const HOME_FIRST_PAINT_WINDOWS = 2;

export function withSatelliteTimeout<T>(
  run: Promise<T>,
  fallback: T,
  ms = HOME_SATELLITE_MS,
): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(fallback);
    }, ms);
    run.then(
      (value) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeout(timer);
        resolve(fallback);
      },
    );
  });
}

export type HomeFeedCursor = {
  createdAt: string;
  id: string;
};

export type HomeFeedPost = {
  id: string;
  created_at: string;
  author_id: string;
  type?: string | null;
  source?: string | null;
  challenge_id?: string | null;
  circle_id?: string | null;
  wall_host_id?: string | null;
  hidden_from_home?: boolean | null;
  audience?: unknown;
  audience_user_ids?: string[] | null;
  circle?: { visibility?: string | null } | null;
};

export type HomeFeedAllowContext = {
  viewerId: string;
  hidden: Set<string>;
  muted: Set<string>;
  blocked: Set<string>;
  friends: Set<string>;
  official: Set<string>;
  recommended: Set<string>;
  challengeIds: Set<string>;
  circleIds: Set<string>;
  corporateIds: Set<string>;
  fofAuthors: Set<string>;
};

export type HomeFeedEmptyPhase = 'shimmer' | 'error' | 'empty' | 'ready';

export function homeFeedFirstPaintLoading(input: {
  postCount: number;
  isFetched?: boolean;
  isPending?: boolean;
  failed?: boolean;
}): boolean {
  if (input.postCount > 0 || input.failed) {
    return false;
  }
  if (input.isPending != null) {
    return input.isPending;
  }
  return !input.isFetched;
}

/** Bob + stretch copy is the failed-posts empty, never first paint. */
export function homeFeedEmptyPhase(input: {
  postCount: number;
  isLoading?: boolean;
  isFetched?: boolean;
  failed?: boolean;
}): HomeFeedEmptyPhase {
  if (input.postCount > 0) {
    return 'ready';
  }
  if (input.failed) {
    return 'error';
  }
  if (input.isLoading || input.isFetched === false) {
    return 'shimmer';
  }
  return 'empty';
}

/** @deprecated Bob is not a loading splash. Kept for callers that still import it. */
export function shouldShowHomeSplash(input: {
  postCount: number;
  isLoading?: boolean;
  failed?: boolean;
  waitedMs?: number;
}): boolean {
  return homeFeedEmptyPhase({
    postCount: input.postCount,
    isLoading: input.isLoading,
    failed: input.failed,
  }) === 'error';
}

export function uniquePostsById<T extends { id: string }>(posts: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const post of posts) {
    if (seen.has(post.id)) {
      continue;
    }
    seen.add(post.id);
    out.push(post);
  }
  return out;
}

export function takeHomeVisiblePage<T extends { id: string }>(
  visible: T[],
  seenIds: Iterable<string> = [],
  size = HOME_PAGE_SIZE,
): T[] {
  const seen = new Set(seenIds);
  const out: T[] = [];
  for (const post of visible) {
    if (seen.has(post.id)) {
      continue;
    }
    seen.add(post.id);
    out.push(post);
    if (out.length >= size) {
      break;
    }
  }
  return out;
}

/** Home SQL keeps legacy null type. Wave / Round / wave_share stay on the player. */
export function homeQueryKeepsType(type?: string | null): boolean {
  if (type == null || type === '') {
    return true;
  }
  return !isHomeExcludedClipType(type);
}

export const HOME_QUERY_TYPE_OR = 'type.is.null,type.not.in.(wave,round,wave_share)';

export function homeFeedCursorFrom(posts: { id: string; created_at: string }[]): HomeFeedCursor | null {
  const last = posts[posts.length - 1];
  if (!last?.created_at || !last.id) {
    return null;
  }
  return { createdAt: last.created_at, id: last.id };
}

export function isBeforeHomeCursor(
  post: { id: string; created_at: string },
  cursor: HomeFeedCursor,
): boolean {
  const a = Date.parse(post.created_at);
  const b = Date.parse(cursor.createdAt);
  if (Number.isFinite(a) && Number.isFinite(b) && a !== b) {
    return a < b;
  }
  return post.id < cursor.id;
}

/** Privacy / hide / block / wave-round. Empty after this is empty — never fall back to raw merge. */
export function homeFeedAllowsPost(post: HomeFeedPost, ctx: HomeFeedAllowContext): boolean {
  const userId = ctx.viewerId;
  if (post.circle_id) {
    if (
      !viewerCanSeeHomeCirclePost({
        circleId: post.circle_id,
        type: post.type,
        hiddenFromHome: post.hidden_from_home,
        visibility: post.circle?.visibility,
        authorId: post.author_id,
        viewerId: userId,
        viewerIsMember: ctx.circleIds.has(post.circle_id),
        friendsWithAuthor: ctx.friends.has(post.author_id),
        friendsOfFriendsWithAuthor: ctx.fofAuthors.has(post.author_id),
      })
    ) {
      return false;
    }
  } else if (post.hidden_from_home && post.author_id !== userId) {
    return false;
  }
  if (isHomeExcludedClipType(post.type)) {
    return false;
  }
  if (post.source === 'challenge') {
    return false;
  }
  if (post.challenge_id && ctx.corporateIds.has(post.challenge_id)) {
    return false;
  }
  if (ctx.hidden.has(post.id)) {
    return false;
  }
  if (post.author_id !== userId && ctx.muted.has(post.author_id) && !ctx.official.has(post.author_id)) {
    return false;
  }
  if (post.author_id !== userId && ctx.blocked.has(post.author_id)) {
    return false;
  }
  const circleHomePass = Boolean(post.circle_id);
  if (
    !circleHomePass &&
    !viewerCanSeeHomePost({
      viewerId: userId,
      authorId: post.author_id,
      audience: post.audience,
      audienceUserIds: post.audience_user_ids,
      friendsWithAuthor: ctx.friends.has(post.author_id),
      officialAuthor: ctx.official.has(post.author_id),
      wallHostId: post.wall_host_id,
    })
  ) {
    return false;
  }
  if (ctx.official.has(post.author_id) || post.author_id === userId || ctx.friends.has(post.author_id)) {
    return true;
  }
  if (post.wall_host_id && (post.wall_host_id === userId || ctx.friends.has(post.wall_host_id))) {
    return asPostAudience(post.audience) === 'public' || post.wall_host_id === userId;
  }
  if (post.challenge_id && ctx.challengeIds.has(post.challenge_id)) {
    return true;
  }
  if (post.circle_id) {
    return true;
  }
  if (ctx.recommended.has(post.author_id)) {
    return asPostAudience(post.audience) === 'public';
  }
  return false;
}

export function filterHomeFeedPosts<T extends HomeFeedPost>(posts: T[], ctx: HomeFeedAllowContext): T[] {
  return posts.filter((post) => homeFeedAllowsPost(post, ctx));
}

export function circleFofCandidateIds<T extends HomeFeedPost>(
  posts: T[],
  ctx: Pick<HomeFeedAllowContext, 'viewerId' | 'friends' | 'circleIds'>,
): string[] {
  return [
    ...new Set(
      posts
        .filter((post) => {
          if (!post.circle_id || post.author_id === ctx.viewerId) {
            return false;
          }
          if (ctx.circleIds.has(post.circle_id) || ctx.friends.has(post.author_id)) {
            return false;
          }
          return asCircleVisibility(post.circle?.visibility) === 'friends_of_friends';
        })
        .map((post) => post.author_id),
    ),
  ];
}
