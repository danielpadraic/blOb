import { describe, expect, it } from 'vitest';

import {
  DEFAULT_RING_GOALS,
  exerciseGoalEdited,
  exerciseSeedFromInterests,
  ringProgress,
  ringTotals,
  scaledRingGoal,
} from '@/lib/dashboard/ringGoals';
import { bucketBodyPoints } from '@/lib/health/bodyDays';

describe('ring goals', () => {
  it('scales a daily goal across the range on screen', () => {
    expect(
      scaledRingGoal({ amount: 500, cadence: 'daily', range: 'week', customDays: 0, monthDays: 31, yearDays: 365 }),
    ).toBe(3500);
    expect(
      scaledRingGoal({ amount: 30, cadence: 'daily', range: 'month', customDays: 0, monthDays: 31, yearDays: 365 }),
    ).toBe(930);
    expect(
      scaledRingGoal({ amount: 12, cadence: 'daily', range: 'custom', customDays: 4, monthDays: 31, yearDays: 365 }),
    ).toBe(48);
  });

  it('scales weekly and monthly goals', () => {
    expect(
      scaledRingGoal({ amount: 210, cadence: 'weekly', range: 'today', customDays: 1, monthDays: 31, yearDays: 365 }),
    ).toBe(30);
    expect(
      scaledRingGoal({ amount: 100, cadence: 'weekly', range: 'month', customDays: 1, monthDays: 31, yearDays: 365 }),
    ).toBeCloseTo((100 * 52) / 12);
    expect(
      scaledRingGoal({ amount: 300, cadence: 'monthly', range: 'year', customDays: 1, monthDays: 31, yearDays: 365 }),
    ).toBe(3600);
    expect(
      scaledRingGoal({ amount: 365, cadence: 'monthly', range: 'today', customDays: 1, monthDays: 31, yearDays: 365 }),
    ).toBeCloseTo(12);
  });

  it('fills to the goal and closes only at 100 percent', () => {
    expect(ringProgress(186, 350)).toBeCloseTo(186 / 350);
    expect(ringProgress(400, 350)).toBe(1);
    expect(ringProgress(0, 350)).toBe(0);
  });
});

describe('exercise seed from Interests', () => {
  it('uses the Lifting goal, not the current count, as 30 minutes a session', () => {
    const seed = exerciseSeedFromInterests([
      {
        label: 'Lifting',
        slug: 'lifting',
        room: 'health_fitness',
        qtyKind: 'sessions_week',
        goalQty: 4,
        currentQty: 1,
        goalPeriod: 'week',
        currentPeriod: 'week',
      },
      {
        label: 'Running',
        slug: 'running',
        room: 'health_fitness',
        qtyKind: 'miles_outing',
        goalQty: 20,
        currentQty: null,
        goalPeriod: 'week',
        currentPeriod: 'week',
      },
      {
        label: 'Walking',
        slug: 'walking',
        room: 'health_fitness',
        qtyKind: 'steps_day',
        goalQty: 10000,
        currentQty: null,
        goalPeriod: 'day',
        currentPeriod: 'day',
      },
    ]);
    expect(seed).toEqual({
      minutes: 120,
      cadence: 'weekly',
      line: 'From your Lifting goal · 4 sessions/week.',
    });
  });

  it('adds session goals that share a period', () => {
    const seed = exerciseSeedFromInterests([
      {
        label: 'Lifting',
        slug: 'lifting',
        room: 'health_fitness',
        qtyKind: 'sessions_week',
        goalQty: 4,
        currentQty: null,
        goalPeriod: 'week',
        currentPeriod: null,
      },
      {
        label: 'HIIT',
        slug: 'hiit',
        room: 'health_fitness',
        qtyKind: 'sessions_week',
        goalQty: 2,
        currentQty: 9,
        goalPeriod: 'week',
        currentPeriod: 'day',
      },
      {
        label: 'Pickleball',
        slug: 'pickleball',
        room: 'sports',
        qtyKind: 'sessions_week',
        goalQty: 1,
        currentQty: null,
        goalPeriod: 'month',
        currentPeriod: 'month',
      },
    ]);
    expect(seed?.minutes).toBe(180);
    expect(seed?.cadence).toBe('weekly');
    expect(seed?.line).toBe('From your Lifting and HIIT goals · 6 sessions/week.');
  });
});

describe('ring quantities', () => {
  it('counts at most one stand hour per clock hour and keeps exercise in minutes', () => {
    const days = bucketBodyPoints(
      [
        { at: '2026-10-01T15:00:00.000Z', value: 40, kind: 'standMin' },
        { at: '2026-10-01T15:20:00.000Z', value: 40, kind: 'standMin' },
        { at: '2026-10-01T16:05:00.000Z', value: 10, kind: 'standMin' },
        { at: '2026-10-01T15:00:00.000Z', value: 20, kind: 'exerciseMin' },
        { at: '2026-10-01T15:00:00.000Z', value: 20, kind: 'exerciseMin' },
        { at: '2026-10-01T15:10:00.000Z', value: 15, kind: 'exerciseMin' },
        { at: '2026-10-01T15:00:00.000Z', value: 186, kind: 'moveKcal' },
      ],
      'America/Chicago',
      'apple_health',
    );
    const day = days.find((row) => row.day === '2026-10-01');
    expect(day?.standHours).toBeCloseTo(1 + 10 / 60);
    expect(day?.exerciseMin).toBe(35);
    expect(day?.moveKcal).toBe(186);
    const totals = ringTotals(
      [{ day: '2026-10-01', standHours: 533, exerciseMin: 273 * 60, moveKcal: 186 }],
      ['2026-10-01'],
    );
    expect(totals.stand).toBe(24);
    expect(totals.exercise).toBe(273);
    expect(totals.move).toBe(186);
  });
});

describe('exercise ring minutes', () => {
  const week = ['2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'];

  it('turns a week of HealthKit seconds into minutes against a 210 min goal', () => {
    const days = week.map((day) => ({ day, exerciseMin: 874 }));
    const totals = ringTotals(days, week);
    expect(totals.exercise).toBeLessThan(110);
    const goal = scaledRingGoal({
      amount: 30,
      cadence: 'daily',
      range: 'week',
      customDays: 7,
      monthDays: 31,
      yearDays: 365,
    });
    expect(goal).toBe(210);
    expect(ringProgress(totals.exercise, goal)).toBeLessThan(1);
  });

  it('never adds Lift on top of the same workout', () => {
    const totals = ringTotals([{ day: '2026-10-05', exerciseMin: 45 }], ['2026-10-05'], { '2026-10-05': 40 });
    expect(totals.exercise).toBe(45);
  });

  it('uses Lift and cardio minutes when Health has nothing for that day', () => {
    const totals = ringTotals([{ day: '2026-10-05', exerciseMin: 20 }], ['2026-10-05', '2026-10-06'], {
      '2026-10-05': 10,
      '2026-10-06': 35,
    });
    expect(totals.exercise).toBe(55);
  });

  it('ignores Lift minutes outside the window', () => {
    expect(ringTotals([], ['2026-10-05'], { '2026-10-12': 60 }).exercise).toBe(0);
  });
});

describe('exercise goal edit flag', () => {
  it('stays unedited when only Move changes', () => {
    const next = { ...DEFAULT_RING_GOALS, move: { amount: 700, cadence: 'daily' as const } };
    expect(exerciseGoalEdited(DEFAULT_RING_GOALS, next, false)).toBe(false);
  });

  it('marks Exercise edited when its amount or cadence changes, and keeps it', () => {
    const amount = { ...DEFAULT_RING_GOALS, exercise: { amount: 45, cadence: 'daily' as const } };
    const cadence = { ...DEFAULT_RING_GOALS, exercise: { amount: 30, cadence: 'weekly' as const } };
    expect(exerciseGoalEdited(DEFAULT_RING_GOALS, amount, false)).toBe(true);
    expect(exerciseGoalEdited(DEFAULT_RING_GOALS, cadence, false)).toBe(true);
    expect(exerciseGoalEdited(DEFAULT_RING_GOALS, DEFAULT_RING_GOALS, true)).toBe(true);
  });

  it('converts a monthly goal from a weekly goal at 52/12', () => {
    const month = scaledRingGoal({
      amount: 150,
      cadence: 'weekly',
      range: 'month',
      customDays: 31,
      monthDays: 31,
      yearDays: 365,
    });
    expect(month).toBeCloseTo((150 * 52) / 12);
  });
});
