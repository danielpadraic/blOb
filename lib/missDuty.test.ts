import { describe, expect, it } from 'vitest';

import {
  challengeHasDailyCheckinDuty,
  challengeShowsMissBudget,
  missesAllowedCap,
  missesAllowedCopy,
  missesUsedCopy,
} from '@/lib/missDuty';

describe('challengeHasDailyCheckinDuty', () => {
  it('allows daily consistency and Official week', () => {
    expect(
      challengeHasDailyCheckinDuty({
        challenge_type: 'consistency',
        format: 'consistency',
        frequency: 'daily',
      }),
    ).toBe(true);
    expect(
      challengeHasDailyCheckinDuty({
        is_official: true,
        series_id: 'week_10',
        frequency: 'daily',
      }),
    ).toBe(true);
  });

  it('stays quiet for weekly, monthly, custom totals, and points', () => {
    expect(
      challengeHasDailyCheckinDuty({
        challenge_type: 'consistency',
        frequency: 'weekly',
        target_count: 5,
      }),
    ).toBe(false);
    expect(
      challengeHasDailyCheckinDuty({
        challenge_type: 'consistency',
        frequency: 'monthly',
      }),
    ).toBe(false);
    expect(
      challengeHasDailyCheckinDuty({
        challenge_type: 'consistency',
        frequency: 'custom',
        target_count: 6,
        days_required: 7,
      }),
    ).toBe(false);
    expect(
      challengeHasDailyCheckinDuty({
        challenge_type: 'points',
        frequency: 'daily',
      }),
    ).toBe(false);
    expect(
      challengeHasDailyCheckinDuty({
        challenge_type: 'cumulative',
        format: 'cumulative',
        frequency: 'daily',
      }),
    ).toBe(false);
  });
});

describe('miss budget copy', () => {
  it('shows allowed vs used only when the format has a daily duty', () => {
    expect(
      challengeShowsMissBudget({
        challenge_type: 'consistency',
        format: 'consistency',
        frequency: 'daily',
        misses_allowed: 2,
      }),
    ).toBe(true);
    expect(
      missesAllowedCap({
        challenge_type: 'consistency',
        frequency: 'daily',
        misses_allowed: 2,
      }),
    ).toBe(2);
    expect(
      challengeShowsMissBudget({
        challenge_type: 'points',
        frequency: 'daily',
        misses_allowed: 3,
      }),
    ).toBe(false);
    expect(
      missesAllowedCap({
        challenge_type: 'consistency',
        frequency: 'weekly',
        misses_allowed: 3,
      }),
    ).toBeNull();
  });

  it('uses the locked 0-cap sentence', () => {
    expect(missesAllowedCopy(0)).toBe(
      'Misses allowed: 0 — miss a required check-in and you are out.',
    );
    expect(missesAllowedCopy(3)).toBe('Misses allowed: 3');
    expect(missesUsedCopy(1)).toBe('Misses used: 1');
  });
});
