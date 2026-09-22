import { describe, expect, it } from 'vitest';

import {
  challengeHasDailyCheckinDuty,
  challengeShowsMissBudget,
  excuseOverConfirmLine,
  missesAllowedCap,
  missesAllowedCopy,
  missesOver,
  missesUsedCopy,
  viewerMissesOverLine,
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
    expect(
      challengeHasDailyCheckinDuty({
        challenge_type: 'consistency',
        format: 'consistency',
        frequency: 'daily',
        metrics: [{ id: 'm1', target: 128, name: 'miles', unit: 'mi' }],
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
    expect(missesAllowedCopy(0)).toBe('miss a required check-in and you are out.');
    expect(missesAllowedCopy(3)).toBe('Misses allowed: 3');
    expect(missesAllowedCopy(6)).toBe('Misses allowed: 6');
    expect(missesAllowedCopy(6)).not.toMatch(/you(?:'|’)re out/i);
    expect(missesUsedCopy(1)).toBe('Misses used: 1');
  });

  it('reads Allowed misses aliases when misses_allowed is absent', () => {
    const daily = {
      challenge_type: 'consistency',
      format: 'consistency',
      frequency: 'daily',
    };
    expect(missesAllowedCap({ ...daily, allowed_misses: 6 })).toBe(6);
    expect(missesAllowedCap({ ...daily, max_misses: 6 })).toBe(6);
    expect(missesAllowedCap({ ...daily, consistency: { misses: 6 } })).toBe(6);
    expect(missesAllowedCap({ ...daily, misses_allowed: 6, allowed_misses: 0 })).toBe(6);
  });
});

describe('misses over', () => {
  it('subtracts allowed and excused from missed periods', () => {
    expect(missesOver({ missedPeriods: 3, allowedMisses: 1, excused: 0 })).toBe(2);
    expect(missesOver({ missedPeriods: 3, allowedMisses: 1, excused: 2 })).toBe(0);
    expect(missesOver({ missedPeriods: 1, allowedMisses: 2 })).toBe(0);
  });

  it('prints the host confirm line for n over', () => {
    expect(excuseOverConfirmLine('Daniel', 2)).toBe(
      'Daniel is 2 misses over. Excuse 2 more to put them back in, or Count the missing day.',
    );
    expect(excuseOverConfirmLine('Daniel', 1)).toBe(
      'Daniel is 1 miss over. Excuse this miss or Count that day to put them back in.',
    );
    expect(excuseOverConfirmLine('Daniel', 0)).toBe(
      'Daniel is still in. This excuse is extra room, not required.',
    );
  });

  it('prints the participant Overview line without eliminated', () => {
    expect(viewerMissesOverLine(2)).toBe(
      'You’re 2 misses over. A host can excuse 2 or count a missed day.',
    );
    expect(viewerMissesOverLine(1)).not.toMatch(/eliminated/i);
  });
});
