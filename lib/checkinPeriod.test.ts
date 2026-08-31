import { describe, expect, it } from 'vitest';

import { currentRequiredPeriodWindow } from '@/lib/checkinPeriod';
import { zonedWallTime } from '@/lib/officialDays';

describe('currentRequiredPeriodWindow', () => {
  it('uses Chicago day-end for Official and hides after submit window closes', () => {
    const now = new Date('2026-08-31T18:00:00-05:00');
    const endsAt = zonedWallTime('2026-08-31', 23, 59, 59, 999, 'America/Chicago');
    const window = currentRequiredPeriodWindow(
      {
        is_official: true,
        series_id: 'week_10',
        status: 'live',
        starts_at: '2026-08-31T00:00:00-05:00',
        timezone: 'America/Chicago',
        days_required: 7,
        frequency: 'daily',
        day_windows: [
          {
            day: 1,
            date: '2026-08-31',
            starts_at: zonedWallTime('2026-08-31', 0, 0, 0, 0, 'America/Chicago').toISOString(),
            ends_at: endsAt.toISOString(),
          },
        ],
      },
      now,
    );
    expect(window?.periodKey).toBe('2026-08-31');
    expect(window?.endsAt.toISOString()).toBe(endsAt.toISOString());
  });

  it('uses the challenge timezone day-end for user-created daily consistency', () => {
    const now = new Date('2026-08-31T15:00:00-04:00');
    const window = currentRequiredPeriodWindow(
      {
        challenge_type: 'consistency',
        format: 'consistency',
        frequency: 'daily',
        status: 'live',
        starts_at: '2026-08-30T12:00:00-04:00',
        timezone: 'America/New_York',
      },
      now,
    );
    expect(window?.periodKey).toBe('2026-08-31');
    expect(window?.endsAt.toISOString()).toBe(
      zonedWallTime('2026-08-31', 23, 59, 59, 999, 'America/New_York').toISOString(),
    );
  });

  it('hides for weekly, points, and LMS', () => {
    const now = new Date('2026-08-31T18:00:00Z');
    expect(
      currentRequiredPeriodWindow(
        {
          challenge_type: 'consistency',
          frequency: 'weekly',
          status: 'live',
          starts_at: '2026-08-24T00:00:00Z',
        },
        now,
      ),
    ).toBeNull();
    expect(
      currentRequiredPeriodWindow(
        {
          challenge_type: 'points',
          frequency: 'daily',
          status: 'live',
          starts_at: '2026-08-24T00:00:00Z',
        },
        now,
      ),
    ).toBeNull();
    expect(
      currentRequiredPeriodWindow(
        {
          challenge_type: 'consistency',
          frequency: 'daily',
          is_unlimited: true,
          status: 'live',
          starts_at: '2026-08-24T00:00:00Z',
        },
        now,
      ),
    ).toBeNull();
  });
});
