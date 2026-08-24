import { describe, expect, it } from 'vitest';

import {
  CHECKIN_RISK_COPY,
  CHECKIN_RISK_MAX_CHARS,
  CHECKIN_RISK_OFFSETS,
  checkinRiskDedupeKey,
  checkinRiskHref,
  pickCheckinRiskCopy,
} from '@/lib/checkin/reminders';

describe('check-in risk reminders', () => {
  it('keeps every Bob line at or under 100 characters', () => {
    for (const offset of CHECKIN_RISK_OFFSETS) {
      for (const line of CHECKIN_RISK_COPY[offset]) {
        expect(line.length, `${offset}h: ${line}`).toBeLessThanOrEqual(CHECKIN_RISK_MAX_CHARS);
        expect(line.toLowerCase()).toMatch(/check[- ]in/);
      }
    }
  });

  it('dedupes by user, challenge, period, and offset', () => {
    expect(
      checkinRiskDedupeKey({
        userId: 'u1',
        challengeId: 'c1',
        periodKey: '2026-08-24',
        offsetHours: 8,
      }),
    ).toBe('u1:c1:2026-08-24:8');
    expect(checkinRiskHref('c1')).toBe('/challenges/c1/submit');
  });

  it('rotates a stable variant per seed', () => {
    const a = pickCheckinRiskCopy(8, 'u1:c1:2026-08-24:8');
    const b = pickCheckinRiskCopy(8, 'u1:c1:2026-08-24:8');
    const other = pickCheckinRiskCopy(8, 'u2:c1:2026-08-24:8');
    expect(a).toBe(b);
    expect(CHECKIN_RISK_COPY[8]).toContain(a);
    expect(CHECKIN_RISK_COPY[8]).toContain(other);
  });
});
