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

export type StoredRingGoals = {
  goals: RingGoals;
  /** True after she taps Save on this dashboard. Interests must not replace Exercise after that. */
  saved: boolean;
};

export async function readRingGoals(): Promise<StoredRingGoals> {
  try {
    const raw = await authStorage.getItem(KEY);
    if (!raw) {
      return { goals: DEFAULT_RING_GOALS, saved: false };
    }
    const parsed = JSON.parse(raw) as Partial<RingGoals> & { saved?: boolean };
    return {
      goals: {
        move: cleanGoal(parsed.move, DEFAULT_RING_GOALS.move),
        exercise: cleanGoal(parsed.exercise, DEFAULT_RING_GOALS.exercise),
        stand: cleanGoal(parsed.stand, DEFAULT_RING_GOALS.stand),
      },
      saved: parsed.saved !== false,
    };
  } catch {
    return { goals: DEFAULT_RING_GOALS, saved: false };
  }
}

export function writeRingGoals(goals: RingGoals): void {
  try {
    void Promise.resolve(authStorage.setItem(KEY, JSON.stringify({ ...goals, saved: true }))).catch(() => undefined);
  } catch {
    // The fields on screen still apply this visit.
  }
}

const FITNESS_SESSION_SLUGS = new Set(['lifting', 'hiit', 'yoga', 'mobility']);

export type InterestExerciseSeed = {
  label: string;
  slug: string;
  room: string;
  qtyKind: string | null;
  goalQty: number | null;
  currentQty: number | null;
  goalPeriod: string | null;
  currentPeriod: string | null;
};

export type ExerciseSeed = {
  minutes: number;
  cadence: GoalCadence;
  line: string;
};

function periodWord(period: 'day' | 'week' | 'month'): string {
  return period;
}

function joinLabels(labels: string[]): string {
  if (labels.length <= 1) {
    return labels[0] ?? '';
  }
  if (labels.length === 2) {
    return `${labels[0]} and ${labels[1]}`;
  }
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}

/**
 * Exercise minutes from Interests session goals.
 * One session is 30 minutes. Sessions add only when they share a period.
 * Steps, miles, and laps are ignored. Goal quantity wins over the current quantity.
 */
export function exerciseSeedFromInterests(rows: readonly InterestExerciseSeed[]): ExerciseSeed | null {
  const grouped: Record<'day' | 'week' | 'month', { label: string; sessions: number }[]> = {
    day: [],
    week: [],
    month: [],
  };
  for (const row of rows) {
    const slug = row.slug.trim().toLowerCase();
    const fitness = row.room === 'health_fitness' && FITNESS_SESSION_SLUGS.has(slug);
    const sports = row.room === 'sports' && row.qtyKind === 'sessions_week' && slug !== 'other';
    if (!fitness && !sports) {
      continue;
    }
    const goal = Number(row.goalQty);
    if (!Number.isFinite(goal) || goal <= 0) {
      continue;
    }
    const period = String(row.goalPeriod || row.currentPeriod || '');
    if (period !== 'day' && period !== 'week' && period !== 'month') {
      continue;
    }
    grouped[period].push({ label: row.label.trim() || slug, sessions: goal });
  }
  const ranked = (['week', 'day', 'month'] as const)
    .map((period) => ({
      period,
      rows: grouped[period],
      sessions: grouped[period].reduce((sum, item) => sum + item.sessions, 0),
    }))
    .filter((group) => group.sessions > 0)
    .sort((a, b) => b.sessions - a.sessions);
  const best = ranked[0];
  if (!best) {
    return null;
  }
  const labels = best.rows.map((item) => item.label).filter(Boolean);
  const noun = labels.length === 1 ? 'goal' : 'goals';
  return {
    minutes: best.sessions * 30,
    cadence: best.period === 'day' ? 'daily' : best.period === 'week' ? 'weekly' : 'monthly',
    line: `From your ${joinLabels(labels)} ${noun} · ${best.sessions} sessions/${periodWord(best.period)}.`,
  };
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
