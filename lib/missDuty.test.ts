import { describe, expect, it } from 'vitest';

import { challengeHasDailyCheckinDuty } from '@/lib/missDuty';

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
