import { describe, expect, it } from 'vitest';

import { LOBBY_COVER_ASPECT, centerCropRect } from '@/lib/lobbyCover';

describe('centerCropRect', () => {
  it('crops a wide photo to the lobby cover frame', () => {
    const crop = centerCropRect(2000, 1000, LOBBY_COVER_ASPECT);
    expect(crop.height).toBe(1000);
    expect(crop.width / crop.height).toBeCloseTo(LOBBY_COVER_ASPECT, 2);
    expect(crop.originX).toBeGreaterThan(0);
    expect(crop.originY).toBe(0);
  });

  it('crops a tall photo to the lobby cover frame', () => {
    const crop = centerCropRect(1000, 2000, LOBBY_COVER_ASPECT);
    expect(crop.width).toBe(1000);
    expect(crop.width / crop.height).toBeCloseTo(LOBBY_COVER_ASPECT, 2);
    expect(crop.originY).toBeGreaterThan(0);
  });
});
