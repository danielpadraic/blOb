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
  const threshold = width * 0.22;
  let next = input.from;
  // Displacement wins when the finger clearly moved. Do not let inverted / tiny
  // web velocity send the pager the other way.
  if (input.dx < -threshold) {
    next += 1;
  } else if (input.dx > threshold) {
    next -= 1;
  } else if (input.vx < -0.45) {
    next += 1;
  } else if (input.vx > 0.45) {
    next -= 1;
  }
  return Math.min(Math.max(next, 0), last);
}

/** Resist past the first / last still so the ends do not feel stuck. */
export function rubberPagerOffset(x: number, pageWidth: number, length: number): number {
  const width = Math.max(pageWidth, 1);
  const min = 0;
  const max = Math.max(length - 1, 0) * width;
  if (x < min) {
    return min - Math.min(72, (min - x) * 0.28);
  }
  if (x > max) {
    return max + Math.min(72, (x - max) * 0.28);
  }
  return x;
}

/** Left 22% of the still → previous. Right 22% → next. Center does not advance. */
export function lightboxEdgeStep(x: number, width: number): -1 | 0 | 1 {
  const w = Math.max(width, 1);
  if (x < w * 0.22) {
    return -1;
  }
  if (x > w * 0.78) {
    return 1;
  }
  return 0;
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

export type LightboxPopAction = 'close' | 'keep' | 'previous';

/**
 * iOS Safari / Chrome treat swipe-right as Back (popstate). A mid-screen page pan must
 * change stills. Real browser / hardware back (no recent sideways pointer) closes.
 * First still + swipe-right stays put.
 */
export function lightboxPopAction(input: {
  page: number;
  dragging: boolean;
  msSincePage: number;
  pointerDx?: number;
  pointerDy?: number;
  pointerAgoMs?: number;
}): LightboxPopAction {
  if (input.dragging || input.msSincePage < 480) {
    return 'keep';
  }
  const dx = input.pointerDx ?? 0;
  const dy = input.pointerDy ?? 0;
  const swipe =
    input.pointerAgoMs != null &&
    input.pointerAgoMs < 640 &&
    Math.abs(dx) > 22 &&
    Math.abs(dx) >= Math.abs(dy);
  if (swipe && dx > 0) {
    return input.page > 0 ? 'previous' : 'keep';
  }
  if (swipe) {
    return 'keep';
  }
  return 'close';
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
