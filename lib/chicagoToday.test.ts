import { describe, expect, it } from 'vitest';

import { chicagoDateStamp } from '@/lib/chicagoToday';

describe('chicagoDateStamp', () => {
  it('keeps 2:30pm Chicago on that calendar day', () => {
    // 19:26 UTC on Sep 4 is 2:26pm CDT Sep 4 — not Sep 5.
    expect(chicagoDateStamp(new Date('2026-09-04T19:26:24.000Z'))).toBe('2026-09-04');
  });

  it('keeps 6:32am Chicago on that calendar day', () => {
    expect(chicagoDateStamp(new Date('2026-09-04T11:32:18.000Z'))).toBe('2026-09-04');
  });

  it('rolls at Chicago midnight, not UTC midnight', () => {
    expect(chicagoDateStamp(new Date('2026-09-05T04:59:00.000Z'))).toBe('2026-09-04');
    expect(chicagoDateStamp(new Date('2026-09-05T05:01:00.000Z'))).toBe('2026-09-05');
  });
});
