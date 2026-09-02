/** Home list videos only. Wave / Round players keep their own chrome. */

export const HOME_VIDEO_VISIBLE_RATIO = 0.5;

/** First-paint queries. Pulse / Rounds stay off this list. Waves = stories rail. */
export const HOME_FIRST_PAINT_QUERIES = [
  'feed/global',
  'home-official-strip',
  'stories',
] as const;

export const HOME_DEFERRED_QUERIES = ['home-pulse', 'reels'] as const;

const greyVideoLogged = new Set<string>();

/** Once per card when a Home video would have painted as an empty grey tile. */
export function logHomeVideoIfGrey(input: {
  postId: string;
  hasPoster: boolean;
  hasSrc: boolean;
  inView: boolean;
}): void {
  if (input.hasPoster || !input.postId || greyVideoLogged.has(input.postId)) {
    return;
  }
  greyVideoLogged.add(input.postId);
  console.log('[blob:home-video]', {
    postId: input.postId,
    hasPoster: input.hasPoster,
    hasSrc: input.hasSrc,
    inView: input.inView,
  });
}

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
  hasSrc?: boolean;
}): boolean {
  if (!input.inView || !input.active || input.reduceMotion) {
    return false;
  }
  if (input.hasSrc === false) {
    return false;
  }
  return true;
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
