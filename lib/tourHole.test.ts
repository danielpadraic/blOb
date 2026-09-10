import { describe, expect, it } from 'vitest';

import { dimWithRoundedHolePath, holeRadius } from '@/lib/tourHole';

describe('tour hole', () => {
  it('uses a rounded radius: at least 20, 22% of the short side, cap 28', () => {
    expect(holeRadius({ width: 44, height: 44 })).toBe(20);
    expect(holeRadius({ width: 300, height: 48 })).toBe(20);
    expect(holeRadius({ width: 200, height: 200 })).toBe(28);
    expect(holeRadius({ width: 100, height: 100 })).toBe(22);
  });

  it('cuts a rounded inner path, not a sharp box', () => {
    const path = dimWithRoundedHolePath({ x: 10, y: 20, width: 100, height: 100 }, 400, 800);
    expect(path).toMatch(/^M0,0H400V800H0Z/);
    expect(path).toContain('A');
    expect(path.match(/A22,22/g)?.length).toBe(4);
  });
});
