/** Home list videos only. Wave / Round players keep their own chrome. */

export const HOME_VIDEO_VISIBLE_RATIO = 0.5;

/** First-paint queries. Pulse / Rounds / people-you-may-know stay off this list. */
export const HOME_FIRST_PAINT_QUERIES = [
  'feed/global',
  'home-official-strip',
  'stories',
  'composer',
] as const;

export const HOME_DEFERRED_QUERIES = ['home-pulse', 'reels'] as const;

export function logHomeFirstPaintQueries(): void {
  if (typeof __DEV__ === 'undefined' || !__DEV__) {
    return;
  }
  console.log('[blob:home] first-paint', {
    run: [...HOME_FIRST_PAINT_QUERIES],
    defer: [...HOME_DEFERRED_QUERIES],
  });
}

export function homeVideoPreload(input: {
  inView: boolean;
  primed?: boolean;
}): 'none' | 'metadata' {
  if (input.inView || input.primed) {
    return 'metadata';
  }
  return 'none';
}

export function canAutoplayHomeVideo(input: {
  inView: boolean;
  active: boolean;
  poster?: string | null;
  metadataReady?: boolean;
  reduceMotion?: boolean;
}): boolean {
  if (!input.inView || !input.active || input.reduceMotion) {
    return false;
  }
  return Boolean(input.poster?.trim()) || Boolean(input.metadataReady);
}

export function homeInlineVideoMuted(input: {
  playingId: string | null;
  postId: string;
  unmutedId: string | null;
}): boolean {
  if (input.playingId !== input.postId) {
    return true;
  }
  return input.unmutedId !== input.postId;
}
