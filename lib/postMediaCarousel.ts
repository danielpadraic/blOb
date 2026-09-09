import { uniqueProofUrls, mediaUrlKey } from '@/lib/challengeProofs';
import type { CheckinProofStats } from '@/lib/checkin/proofStats';
import { pagerUrlsWithWorkoutCard } from '@/lib/health/postWorkoutCard';
import { WORKOUT_CARD_HEIGHT, WORKOUT_CARD_WIDTH } from '@/lib/health/workoutProofCard';
import { hiddenMediaSet } from '@/lib/postEdit';
import { FEED_COLUMN_MAX } from '@/lib/theme';
import { mediaKind } from '@/utils/media';

export const POST_MEDIA_CYCLE_MS = 3200;
export const CAROUSEL_GESTURE_SLOP = 10;

/** Carousel claims the touch only after a clear sideways move. Vertical stays with the feed. */
export function carouselClaimsHorizontal(
  dx: number,
  dy: number,
  slop = CAROUSEL_GESTURE_SLOP,
): boolean {
  return Math.abs(dx) > slop && Math.abs(dx) > Math.abs(dy);
}

export function snapCarouselIndex(input: {
  from: number;
  dx: number;
  vx: number;
  pageWidth: number;
  length: number;
}): number {
  const width = Math.max(input.pageWidth, 1);
  const last = Math.max(input.length - 1, 0);
  let next = input.from;
  if (input.dx < -width * 0.22 || input.vx < -0.45) {
    next += 1;
  } else if (input.dx > width * 0.22 || input.vx > 0.45) {
    next -= 1;
  }
  return Math.min(Math.max(next, 0), last);
}

/** Lightbox pan uses Gesture Handler velocity (px/s). Same snap as the in-feed pager. */
export function snapLightboxIndex(input: {
  from: number;
  dx: number;
  velocityX: number;
  pageWidth: number;
  length: number;
}): number {
  return snapCarouselIndex({
    from: input.from,
    dx: input.dx,
    vx: input.velocityX / 1000,
    pageWidth: input.pageWidth,
    length: input.length,
  });
}

export type PagerOrientation = 'portrait' | 'landscape';

export type MediaSize = {
  width: number;
  height: number;
};

const pagerIndexMemory = new Map<string, number>();

export function clearPagerIndexMemory() {
  pagerIndexMemory.clear();
}

export function rememberedPagerIndex(postId: string, length: number): number {
  if (length <= 0) {
    return 0;
  }
  const stored = pagerIndexMemory.get(postId);
  if (stored == null) {
    return 0;
  }
  return Math.min(Math.max(stored, 0), length - 1);
}

export function rememberPagerIndex(postId: string, index: number) {
  if (!postId) {
    return;
  }
  pagerIndexMemory.set(postId, Math.max(index, 0));
}

export function isVisualPostMedia(url: string): boolean {
  const kind = mediaKind(url);
  return kind === 'image' || kind === 'video';
}

export function isStillPostMedia(url: string): boolean {
  return mediaKind(url) === 'image';
}

/** Owner sees hidden frames. Everyone else only sees what they are allowed to. Order stays as stored. */
export function pagerUrlsForViewer(input: {
  urls?: string[] | null | unknown;
  hidden?: string[] | null | unknown;
  isOwner?: boolean;
}): string[] {
  const all = uniqueProofUrls(input.urls).filter(isVisualPostMedia);
  if (input.isOwner) {
    return all;
  }
  const skip = hiddenMediaSet(input.hidden as string[] | null | undefined);
  return all.filter((url) => !skip.has(mediaUrlKey(url)));
}

/** Same stills Home and Live page: user photos first, generated recap last. */
export function mediaUrlsForPost(input: {
  urls?: string[] | null;
  hidden?: string[] | null;
  isOwner?: boolean;
  stats?: CheckinProofStats | null;
}): string[] {
  return pagerUrlsWithWorkoutCard(
    pagerUrlsForViewer({
      urls: input.urls,
      hidden: input.hidden,
      isOwner: input.isOwner,
    }),
    input.stats,
  );
}

export function stillCountInPager(urls: string[]): number {
  return urls.filter(isStillPostMedia).length;
}

export function orientationFromSize(size?: MediaSize | null): PagerOrientation {
  if (!size || size.width <= 0 || size.height <= 0) {
    return 'portrait';
  }
  if (size.height > size.width) {
    return 'portrait';
  }
  const delta = Math.abs(size.width - size.height) / size.width;
  if (delta < 0.04) {
    return 'portrait';
  }
  return 'landscape';
}

/**
 * Portrait / square: ~62–68% of the viewport, cap 72vh, leave room for caption + reactions + tab bar.
 * Landscape: stacked pager, shorter — min(width * 9/16, 36–42% vh).
 */
export function pagerFrameHeight(input: {
  viewportHeight: number;
  cardWidth: number;
  orientation: PagerOrientation;
}): number {
  const vh = Math.max(input.viewportHeight, 1);
  const width = Math.max(input.cardWidth, 1);
  const chrome = Math.min(320, vh * 0.38);

  if (input.orientation === 'landscape') {
    const byRatio = width * (9 / 16);
    const high = vh * 0.42;
    return Math.round(Math.min(byRatio, high));
  }

  const target = vh * 0.65;
  const floor = vh * 0.62;
  const cap = Math.min(vh * 0.72, Math.max(vh - chrome, floor));
  return Math.round(Math.min(cap, Math.max(floor, Math.min(target, cap))));
}

/** Live check-in tile: same 2:3 card shape Home uses, not the Home 65vh hero. */
export function liveInlineFrameHeight(cardWidth: number): number {
  return Math.round(Math.max(cardWidth, 1) * (WORKOUT_CARD_HEIGHT / WORKOUT_CARD_WIDTH));
}

/** Seed Live carousel width before onLayout so photos paint instead of an empty cream slab. */
export function liveInlineSeedWidth(windowW: number): number {
  return Math.max(160, Math.round(Math.min(windowW * 0.72, FEED_COLUMN_MAX)));
}

export function nextAutoCycleIndex(urls: string[], from: number): number {
  if (urls.length === 0) {
    return 0;
  }
  const start = ((from % urls.length) + urls.length) % urls.length;
  for (let step = 1; step <= urls.length; step += 1) {
    const next = (start + step) % urls.length;
    if (isStillPostMedia(urls[next])) {
      return next;
    }
  }
  return start;
}

export function canAutoCyclePager(input: {
  stillCount: number;
  reducedMotion: boolean;
  userPaused: boolean;
  inView: boolean;
  videoPlaying: boolean;
}): boolean {
  return (
    input.stillCount >= 2 &&
    !input.reducedMotion &&
    !input.userPaused &&
    input.inView &&
    !input.videoPlaying
  );
}
