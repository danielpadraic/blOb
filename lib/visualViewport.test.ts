import { describe, expect, it } from 'vitest';

import { visualViewportBox, visualViewportOcclusion } from '@/lib/visualViewport';

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
