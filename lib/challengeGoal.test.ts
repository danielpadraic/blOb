import { describe, expect, it } from 'vitest';

import { challengeDurationDays, challengeGoalLabel, storedDurationDays } from '@/lib/challengeGoal';

describe('stored duration', () => {
  it('prefers length_value then days_required over a stale 6-day window', () => {
    const row = {
      days_required: 30,
      length_value: 30,
      length_unit: 'days',
      starts_at: '2026-08-01T09:00:00.000Z',
      ends_at: '2026-08-07T09:00:00.000Z',
    };
    expect(storedDurationDays(row)).toBe(30);
    expect(challengeDurationDays(row)).toBe(30);
    expect(challengeGoalLabel(row, { daysCompleted: 0 })).toBe('0 of 30 days');
  });

  it('keeps duration_days=30 even when ends_at is a 6-day window', () => {
    expect(
      challengeDurationDays({
        duration_days: 30,
        days_required: 30,
        length_value: 30,
        length_unit: 'days',
        starts_at: '2026-08-01T09:00:00.000Z',
        ends_at: '2026-08-07T09:00:00.000Z',
      }),
    ).toBe(30);
  });

  it('still finds 30 when length_value was not selected', () => {
    expect(
      challengeDurationDays({
        days_required: 30,
        starts_at: '2026-08-01T09:00:00.000Z',
        ends_at: '2026-08-07T09:00:00.000Z',
      }),
    ).toBe(30);
  });

  it('prints personal points as logged / target', () => {
    expect(
      challengeGoalLabel(
        { challenge_type: 'points', target_count: 50, title: 'First to 50' },
        { pointsCompleted: 0 },
      ),
    ).toBe('0 / 50 points');
    expect(
      challengeGoalLabel(
        { challenge_type: 'points', target_count: 50, title: 'First to 50' },
        { pointsCompleted: 12 },
      ),
    ).toBe('12 / 50 points');
  });

  it('does not invent 6 when nothing is saved', () => {
    expect(storedDurationDays({ days_required: 0, length_value: null })).toBeNull();
    expect(challengeDurationDays({ days_required: 0, length_value: null })).toBe(1);
  });
});
