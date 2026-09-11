import { describe, expect, it, beforeEach } from 'vitest';

import {
  canAutoCyclePager,
  carouselClaimsHorizontal,
  clearPagerIndexMemory,
  snapLightboxIndex,
  lightboxEdgeStep,
  lightboxPopAction,
  rubberPagerOffset,
  nextAutoCycleIndex,
  snapCarouselIndex,
  orientationFromSize,
  pagerFrameHeight,
  pagerUrlsForViewer,
  mediaUrlsForPost,
  liveInlineFrameHeight,
  liveInlineSeedWidth,
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

  it('lets the feed keep vertical pans and only pages on a clear sideways move', () => {
    expect(carouselClaimsHorizontal(4, 1)).toBe(false);
    expect(carouselClaimsHorizontal(12, 20)).toBe(false);
    expect(carouselClaimsHorizontal(16, 8)).toBe(true);
    expect(carouselClaimsHorizontal(-16, 8)).toBe(true);
    expect(snapCarouselIndex({ from: 0, dx: -90, vx: 0, pageWidth: 390, length: 3 })).toBe(1);
    expect(snapCarouselIndex({ from: 1, dx: 90, vx: 0, pageWidth: 390, length: 3 })).toBe(0);
    expect(snapCarouselIndex({ from: 0, dx: -20, vx: 0, pageWidth: 390, length: 3 })).toBe(0);
    expect(snapCarouselIndex({ from: 0, dx: 40, vx: 0, pageWidth: 390, length: 3 })).toBe(0);
    expect(snapCarouselIndex({ from: 2, dx: -40, vx: 0, pageWidth: 390, length: 3 })).toBe(2);
    expect(
      snapCarouselIndex({ from: 1, dx: 90, vx: -2, pageWidth: 390, length: 3 }),
    ).toBe(0);
    expect(
      snapLightboxIndex({ from: 0, dx: -90, velocityX: 0, pageWidth: 390, length: 3 }),
    ).toBe(1);
    expect(
      snapLightboxIndex({ from: 1, dx: 90, velocityX: 0, pageWidth: 390, length: 3 }),
    ).toBe(0);
    expect(
      snapLightboxIndex({ from: 1, dx: 90, velocityX: -2000, pageWidth: 390, length: 3 }),
    ).toBe(0);
    expect(
      snapLightboxIndex({ from: 1, dx: 10, velocityX: 800, pageWidth: 390, length: 3 }),
    ).toBe(0);
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

  it('keeps swipe-right as previous still when Safari steals it as Back', () => {
    expect(
      lightboxPopAction({ page: 1, dragging: true, msSincePage: 2000, pointerDx: 80, pointerDy: 4, pointerAgoMs: 40 }),
    ).toBe('keep');
    expect(
      lightboxPopAction({ page: 1, dragging: false, msSincePage: 80, pointerDx: 80, pointerDy: 4, pointerAgoMs: 40 }),
    ).toBe('keep');
    expect(
      lightboxPopAction({ page: 1, dragging: false, msSincePage: 2000, pointerDx: 80, pointerDy: 4, pointerAgoMs: 40 }),
    ).toBe('previous');
    expect(
      lightboxPopAction({ page: 0, dragging: false, msSincePage: 2000, pointerDx: 80, pointerDy: 4, pointerAgoMs: 40 }),
    ).toBe('keep');
    expect(lightboxPopAction({ page: 2, dragging: false, msSincePage: 2000 })).toBe('close');
  });

  it('pages from lightbox tap zones and rubber-bands past the ends', () => {
    expect(lightboxEdgeStep(20, 390)).toBe(-1);
    expect(lightboxEdgeStep(195, 390)).toBe(0);
    expect(lightboxEdgeStep(360, 390)).toBe(1);
    expect(rubberPagerOffset(-80, 390, 3)).toBeLessThan(0);
    expect(rubberPagerOffset(-80, 390, 3)).toBeGreaterThan(-80);
    expect(rubberPagerOffset(390, 390, 3)).toBe(390);
    expect(rubberPagerOffset(390 * 2 + 80, 390, 3)).toBeGreaterThan(390 * 2);
    expect(rubberPagerOffset(390 * 2 + 80, 390, 3)).toBeLessThan(390 * 2 + 80);
  });

  it('keeps user stills and does not invent a branded card for OCR numbers', () => {
    expect(
      mediaUrlsForPost({
        urls: ['https://cdn.test/watch.jpg', 'https://cdn.test/hr.jpg'],
        stats: { duration_sec: 2100, active_cal: 218 },
      }),
    ).toEqual(['https://cdn.test/watch.jpg', 'https://cdn.test/hr.jpg']);
  });

  it('shows the same selfie + HealthKit recap JPEG on Home and Live', () => {
    const card = 'https://cdn.test/hr_monitor-9.jpg';
    const shot = 'https://cdn.test/pre.jpg';
    expect(
      mediaUrlsForPost({
        urls: [shot, card],
        stats: { duration_sec: 2100, active_cal: 218, card_url: card },
      }),
    ).toEqual([shot, card]);
  });

  it('sizes the Live tile from the workout card shape and seeds a width before layout', () => {
    expect(liveInlineFrameHeight(360)).toBe(540);
    expect(liveInlineSeedWidth(400)).toBe(288);
    expect(liveInlineSeedWidth(80)).toBe(160);
  });
});
