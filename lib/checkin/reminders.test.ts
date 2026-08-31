import { describe, expect, it } from 'vitest';

import {
  CHECKIN_RISK_COPY,
  CHECKIN_RISK_MAX_CHARS,
  CHECKIN_RISK_OFFSETS,
  checkinReminderChallengeName,
  checkinRiskDedupeKey,
  checkinRiskHref,
  formatCheckinRiskLine,
  isCheckinNudgeType,
  pickCheckinRiskCopy,
} from '@/lib/checkin/reminders';

describe('check-in risk reminders', () => {
  it('keeps every Bob line at or under 100 characters after the challenge name', () => {
    for (const tone of ['gentle', 'honest'] as const) {
      for (const offset of CHECKIN_RISK_OFFSETS) {
        for (const line of CHECKIN_RISK_COPY[tone][offset]) {
          const filled = formatCheckinRiskLine(line, '30-Day Consistency');
          expect(filled.length, `${tone} ${offset}h: ${filled}`).toBeLessThanOrEqual(
            CHECKIN_RISK_MAX_CHARS,
          );
          expect(filled.toLowerCase()).toMatch(/check[- ]in/);
          expect(filled).toContain('30-Day Consistency');
        }
      }
    }
  });

  it('uses title then task for the challenge name', () => {
    expect(checkinReminderChallengeName({ title: '30-Day Consistency', task: 'Run' })).toBe(
      '30-Day Consistency',
    );
    expect(checkinReminderChallengeName({ title: 'Untitled challenge', task: 'Prayer' })).toBe(
      'Prayer',
    );
  });

  it('opens Overview, never submit', () => {
    expect(checkinRiskHref('c1')).toBe('/challenges/c1');
    expect(checkinRiskHref('c1')).not.toMatch(/submit|capture|camera/);
    expect(isCheckinNudgeType('challenge_checkin_reminder')).toBe(true);
    expect(isCheckinNudgeType('health_checkout')).toBe(true);
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
  });

  it('rotates a stable variant per seed and includes the name', () => {
    const a = pickCheckinRiskCopy(8, 'u1:c1:2026-08-24:8', '30-Day Consistency', 'gentle');
    const b = pickCheckinRiskCopy(8, 'u1:c1:2026-08-24:8', '30-Day Consistency', 'gentle');
    expect(a).toBe(b);
    expect(a).toContain('30-Day Consistency');
    expect(a.length).toBeLessThanOrEqual(CHECKIN_RISK_MAX_CHARS);
  });
});
