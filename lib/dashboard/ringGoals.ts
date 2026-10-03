import { authStorage } from '@/lib/utils/secureStore';
import { dateStampInZone } from '@/lib/officialDays';

import type { DashboardRange } from '@/lib/dashboard/range';
import { positiveNumber, type BodyDay } from '@/lib/health/bodyDays';

export type GoalCadence = 'daily' | 'weekly' | 'monthly';

export type RingGoal = {
  amount: number;
  cadence: GoalCadence;
};

export type RingGoals = {
  move: RingGoal;
  exercise: RingGoal;
  stand: RingGoal;
};

const KEY = 'blob:ring-goals';

export const DEFAULT_RING_GOALS: RingGoals = {
  move: { amount: 500, cadence: 'daily' },
  exercise: { amount: 30, cadence: 'daily' },
  stand: { amount: 12, cadence: 'daily' },
};

const CADENCE = new Set<GoalCadence>(['daily', 'weekly', 'monthly']);

function cleanGoal(value: unknown, fallback: RingGoal): RingGoal {
  const row = value && typeof value === 'object' ? (value as { amount?: unknown; cadence?: unknown }) : {};
  const amount = Number(row.amount);
  const cadence = CADENCE.has(row.cadence as GoalCadence) ? (row.cadence as GoalCadence) : fallback.cadence;
  return {
    amount: Number.isFinite(amount) && amount > 0 ? amount : fallback.amount,
    cadence,
  };
}

export async function readRingGoals(): Promise<RingGoals> {
  try {
    const raw = await authStorage.getItem(KEY);
    if (!raw) {
      return DEFAULT_RING_GOALS;
    }
    const parsed = JSON.parse(raw) as Partial<RingGoals>;
    return {
      move: cleanGoal(parsed.move, DEFAULT_RING_GOALS.move),
      exercise: cleanGoal(parsed.exercise, DEFAULT_RING_GOALS.exercise),
      stand: cleanGoal(parsed.stand, DEFAULT_RING_GOALS.stand),
    };
  } catch {
    return DEFAULT_RING_GOALS;
  }
}

export function writeRingGoals(goals: RingGoals): void {
  try {
    void Promise.resolve(authStorage.setItem(KEY, JSON.stringify(goals))).catch(() => undefined);
  } catch {
    // The fields on screen still apply this visit.
  }
}

export function daysInMonth(now: Date, timeZone: string): number {
  const today = dateStampInZone(now, timeZone);
  const [year, month] = today.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function daysInYear(now: Date, timeZone: string): number {
  const year = Number(dateStampInZone(now, timeZone).slice(0, 4));
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  return leap ? 366 : 365;
}

/** Saved goal restated for the range on screen. */
export function scaledRingGoal(input: {
  amount: number;
  cadence: GoalCadence;
  range: DashboardRange;
  customDays: number;
  monthDays: number;
  yearDays: number;
}): number {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  const custom = Math.max(input.customDays, 1);
  if (input.cadence === 'daily') {
    if (input.range === 'today') return amount;
    if (input.range === 'week') return amount * 7;
    if (input.range === 'month') return amount * input.monthDays;
    if (input.range === 'year') return amount * input.yearDays;
    return amount * custom;
  }
  if (input.cadence === 'weekly') {
    if (input.range === 'today') return amount / 7;
    if (input.range === 'week') return amount;
    if (input.range === 'month') return (amount * 52) / 12;
    if (input.range === 'year') return amount * 52;
    return amount * (custom / 7);
  }
  if (input.range === 'today') return (amount * 12) / 365;
  if (input.range === 'week') return (amount * 12) / 52;
  if (input.range === 'month') return amount;
  if (input.range === 'year') return amount * 12;
  return ((amount * 12) / 365) * custom;
}

export function ringProgress(value: number, goal: number): number {
  if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(goal) || goal <= 0) {
    return 0;
  }
  return Math.min(1, value / goal);
}

/** Active calories, exercise minutes, and stand hours. A day cannot exceed 24 stand hours or 1,440 exercise minutes. */
export function ringTotals(days: readonly BodyDay[], keys: readonly string[]): {
  move: number;
  exercise: number;
  stand: number;
} {
  const inRange = days.filter((day) => keys.includes(day.day));
  let move = 0;
  let exercise = 0;
  let stand = 0;
  for (const day of inRange) {
    const active = positiveNumber(day.moveKcal) ?? positiveNumber(day.calories) ?? 0;
    move += active;
    exercise += Math.min(24 * 60, positiveNumber(day.exerciseMin) ?? 0);
    stand += Math.min(24, positiveNumber(day.standHours) ?? 0);
  }
  return { move, exercise, stand };
}
