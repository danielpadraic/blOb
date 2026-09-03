import { describe, expect, it } from 'vitest';

import {
  checkinPeriodKey,
  challengeClockTz,
  consistencyPeriodAt,
  currentRequiredPeriodWindow,
} from '@/lib/checkinPeriod';
import { DEFAULT_CHALLENGE_TIMEZONE } from '@/lib/challengeTimezone';
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

  it('uses 24h slices from a non-midnight starts_at', () => {
    const now = new Date('2026-08-31T15:00:00-04:00');
    const startsAt = '2026-08-30T12:00:00-04:00';
    const window = currentRequiredPeriodWindow(
      {
        challenge_type: 'consistency',
        format: 'consistency',
        frequency: 'daily',
        status: 'live',
        starts_at: startsAt,
        timezone: 'America/New_York',
      },
      now,
    );
    expect(window?.periodKey).toBe('2026-08-31');
    expect(window?.endsAt.toISOString()).toBe(new Date('2026-09-01T12:00:00-04:00').toISOString());
  });

  it('keeps a Mountain midnight 30-day day open until local midnight, not 6pm', () => {
    const challenge = {
      challenge_type: 'consistency' as const,
      format: 'consistency',
      frequency: 'daily',
      status: 'live',
      starts_at: '2026-09-01T06:00:00.000Z',
      ends_at: '2026-10-01T06:00:00.000Z',
      timezone: 'America/Boise',
    };
    const evening = new Date('2026-09-02T19:00:00-06:00');
    const window = currentRequiredPeriodWindow(challenge, evening);
    expect(checkinPeriodKey(challenge, evening)).toBe('2026-09-02');
    expect(window?.periodKey).toBe('2026-09-02');
    expect(window?.endsAt.toISOString()).toBe('2026-09-03T06:00:00.000Z');
    expect(checkinPeriodKey(challenge, new Date('2026-09-03T00:01:00-06:00'))).toBe('2026-09-03');
  });

  it('defaults a missing timezone to America/Denver, never UTC calendar dates', () => {
    expect(challengeClockTz({ challenge_type: 'consistency' })).toBe(DEFAULT_CHALLENGE_TIMEZONE);
    const evening = new Date('2026-09-02T21:34:00-06:00');
    const window = currentRequiredPeriodWindow(
      {
        challenge_type: 'consistency',
        format: 'consistency',
        frequency: 'daily',
        status: 'live',
        starts_at: '2026-09-01T06:00:00.000Z',
        ends_at: '2026-10-01T06:00:00.000Z',
      },
      evening,
    );
    expect(window?.periodKey).toBe('2026-09-02');
    expect(window?.endsAt.toISOString()).toBe('2026-09-03T06:00:00.000Z');
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

describe('consistencyPeriodAt', () => {
  it('does not open Sep 3 at 7pm MDT when the day boundary is midnight MDT', () => {
    const slice = consistencyPeriodAt(
      {
        starts_at: '2026-09-01T06:00:00.000Z',
        timezone: 'America/Boise',
      },
      new Date('2026-09-02T19:00:00-06:00'),
    );
    expect(slice?.periodKey).toBe('2026-09-02');
    expect(slice?.endsAt.toISOString()).toBe('2026-09-03T06:00:00.000Z');
  });
});
