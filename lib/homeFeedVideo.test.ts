import { describe, expect, it } from 'vitest';

import {
  HOME_DEFERRED_QUERIES,
  HOME_FIRST_PAINT_QUERIES,
  HOME_VIDEO_VISIBLE_RATIO,
  canAutoplayHomeVideo,
  homeInlineVideoMuted,
  homeVideoPreload,
} from '@/lib/homeFeedVideo';

describe('home feed video', () => {
  it('requires half the card in view and a poster before muted autoplay', () => {
    expect(HOME_VIDEO_VISIBLE_RATIO).toBe(0.5);
    expect(
      canAutoplayHomeVideo({ inView: true, active: true, poster: 'https://cdn.test/still.jpg' }),
    ).toBe(true);
    expect(canAutoplayHomeVideo({ inView: true, active: true, metadataReady: true })).toBe(true);
    expect(canAutoplayHomeVideo({ inView: true, active: true })).toBe(false);
    expect(
      canAutoplayHomeVideo({
        inView: false,
        active: true,
        poster: 'https://cdn.test/still.jpg',
      }),
    ).toBe(false);
    expect(
      canAutoplayHomeVideo({
        inView: true,
        active: false,
        poster: 'https://cdn.test/still.jpg',
      }),
    ).toBe(false);
    expect(
      canAutoplayHomeVideo({
        inView: true,
        active: true,
        poster: 'https://cdn.test/still.jpg',
        reduceMotion: true,
      }),
    ).toBe(false);
  });

  it('preloads none offscreen and metadata only for the in-view or primed clip', () => {
    expect(homeVideoPreload({ inView: false })).toBe('none');
    expect(homeVideoPreload({ inView: true })).toBe('metadata');
    expect(homeVideoPreload({ inView: false, primed: true })).toBe('metadata');
  });

  it('keeps one clip unmuted and remutes when the next card takes over', () => {
    expect(
      homeInlineVideoMuted({ playingId: 'a', postId: 'a', unmutedId: null }),
    ).toBe(true);
    expect(
      homeInlineVideoMuted({ playingId: 'a', postId: 'a', unmutedId: 'a' }),
    ).toBe(false);
    expect(
      homeInlineVideoMuted({ playingId: 'b', postId: 'a', unmutedId: 'a' }),
    ).toBe(true);
  });

  it('keeps Pulse and Rounds off the first-paint query list', () => {
    expect(HOME_FIRST_PAINT_QUERIES).toEqual([
      'feed/global',
      'home-official-strip',
      'stories',
      'composer',
    ]);
    expect(HOME_DEFERRED_QUERIES).toContain('home-pulse');
    expect(HOME_DEFERRED_QUERIES).toContain('reels');
    expect(HOME_FIRST_PAINT_QUERIES).not.toContain('home-pulse');
    expect(HOME_FIRST_PAINT_QUERIES).not.toContain('reels');
  });
});
