import { uniqueProofUrls, mediaUrlKey } from '@/lib/challengeProofs';
import { hiddenMediaSet } from '@/lib/postEdit';
import { mediaKind } from '@/utils/media';

export const POST_MEDIA_CYCLE_MS = 3200;

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
  urls?: string[] | null;
  hidden?: string[] | null;
  isOwner?: boolean;
}): string[] {
  const all = uniqueProofUrls(input.urls ?? []).filter(isVisualPostMedia);
  if (input.isOwner) {
    return all;
  }
  const skip = hiddenMediaSet(input.hidden);
  return all.filter((url) => !skip.has(mediaUrlKey(url)));
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
