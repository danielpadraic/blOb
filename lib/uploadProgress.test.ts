import { describe, expect, it } from 'vitest';

import { uploadProgressPercent } from '@/lib/uploadProgress';

describe('uploadProgressPercent', () => {
  it('returns a 0–100 percent when byte totals are known', () => {
    expect(uploadProgressPercent(50, 100)).toBe(50);
    expect(uploadProgressPercent(0, 10)).toBe(0);
    expect(uploadProgressPercent(11, 10)).toBe(100);
  });

  it('returns null when the client cannot read bytes', () => {
    expect(uploadProgressPercent(10, 0)).toBeNull();
    expect(uploadProgressPercent(Number.NaN, 100)).toBeNull();
  });
});
