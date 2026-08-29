import { describe, expect, it, beforeEach } from 'vitest';

import {
  canAutoCyclePager,
  clearPagerIndexMemory,
  nextAutoCycleIndex,
  orientationFromSize,
  pagerFrameHeight,
  pagerUrlsForViewer,
  rememberPagerIndex,
  rememberedPagerIndex,
  stillCountInPager,
} from '@/lib/postMediaCarousel';

describe('post media carousel', () => {
  beforeEach(() => {
    clearPagerIndexMemory();
  });

  it('keeps proof order and lets the owner page hidden frames', () => {
    const urls = [
      'https://cdn.test/checkin.jpg',
      'https://cdn.test/checkout.jpg',
      'https://cdn.test/hr.jpg',
    ];
    expect(
      pagerUrlsForViewer({
        urls,
        hidden: ['https://cdn.test/hr.jpg'],
        isOwner: true,
      }),
    ).toEqual(urls);
    expect(
      pagerUrlsForViewer({
        urls,
        hidden: ['https://cdn.test/hr.jpg'],
        isOwner: false,
      }),
    ).toEqual(['https://cdn.test/checkin.jpg', 'https://cdn.test/checkout.jpg']);
  });

  it('sizes portrait tall and landscape shorter, never a 2-up grid', () => {
    const portrait = pagerFrameHeight({
      viewportHeight: 844,
      cardWidth: 390,
      orientation: 'portrait',
    });
    const landscape = pagerFrameHeight({
      viewportHeight: 844,
      cardWidth: 390,
      orientation: 'landscape',
    });
    expect(portrait).toBeGreaterThanOrEqual(Math.round(844 * 0.62));
    expect(portrait).toBeLessThanOrEqual(Math.round(844 * 0.72));
    expect(landscape).toBeLessThan(portrait);
    expect(landscape).toBeLessThanOrEqual(Math.round(390 * (9 / 16)) + 1);
    expect(orientationFromSize({ width: 1200, height: 1200 })).toBe('portrait');
    expect(orientationFromSize({ width: 1920, height: 1080 })).toBe('landscape');
    expect(orientationFromSize({ width: 1080, height: 1920 })).toBe('portrait');
  });

  it('remembers the last slide for a post and starts at 0', () => {
    expect(rememberedPagerIndex('p1', 3)).toBe(0);
    rememberPagerIndex('p1', 2);
    expect(rememberedPagerIndex('p1', 3)).toBe(2);
    expect(rememberedPagerIndex('p1', 2)).toBe(1);
  });

  it('auto-cycles only 2+ stills in view, never after a swipe or while a video plays', () => {
    expect(stillCountInPager(['https://a.jpg', 'https://b.jpg', 'https://c.mp4'])).toBe(2);
    expect(
      canAutoCyclePager({
        stillCount: 3,
        reducedMotion: false,
        userPaused: false,
        inView: true,
        videoPlaying: false,
      }),
    ).toBe(true);
    expect(
      canAutoCyclePager({
        stillCount: 3,
        reducedMotion: false,
        userPaused: true,
        inView: true,
        videoPlaying: false,
      }),
    ).toBe(false);
    expect(
      canAutoCyclePager({
        stillCount: 1,
        reducedMotion: false,
        userPaused: false,
        inView: true,
        videoPlaying: false,
      }),
    ).toBe(false);
    expect(
      canAutoCyclePager({
        stillCount: 3,
        reducedMotion: true,
        userPaused: false,
        inView: true,
        videoPlaying: false,
      }),
    ).toBe(false);
    expect(nextAutoCycleIndex(['https://a.jpg', 'https://b.jpg', 'https://c.mp4'], 0)).toBe(1);
    expect(nextAutoCycleIndex(['https://a.jpg', 'https://b.jpg', 'https://c.mp4'], 1)).toBe(0);
  });
});
