import { describe, expect, it } from 'vitest';

import { visualViewportBox, visualViewportOcclusion, watchSurfaceBox } from '@/lib/visualViewport';

describe('visualViewportOcclusion', () => {
  it('returns 0 when visualViewport is missing', () => {
    expect(visualViewportOcclusion()).toBe(0);
  });
});

describe('visualViewportBox', () => {
  it('falls back to the window size when visualViewport is missing', () => {
    const box = visualViewportBox();
    expect(box.top).toBe(0);
    expect(box.left).toBe(0);
    expect(box.width).toBeGreaterThanOrEqual(0);
    expect(box.height).toBeGreaterThanOrEqual(0);
  });
});

describe('watchSurfaceBox', () => {
  it('keeps a phone-width viewport as the full visual box', () => {
    expect(watchSurfaceBox({ top: 12, left: 0, width: 390, height: 700 }, 430)).toEqual({
      top: 12,
      left: 0,
      width: 390,
      height: 700,
    });
  });

  it('centers the Home shell on a wide desktop viewport', () => {
    expect(watchSurfaceBox({ top: 0, left: 0, width: 1440, height: 900 }, 430)).toEqual({
      top: 0,
      left: 505,
      width: 430,
      height: 900,
    });
  });
});
