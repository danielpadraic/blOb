import { startOfDay, startOfMonth, startOfWeek } from 'date-fns';

export function startOfLocalDay(now = new Date()): Date {
  return startOfDay(now);
}

/** Challenge period for Health queries: last required log, or start of local day → now. */
export function healthQueryWindow(opts?: { lastLogAt?: string | null }): { from: Date; to: Date } {
  const to = new Date();
  if (opts?.lastLogAt) {
    const last = new Date(opts.lastLogAt);
    if (!Number.isNaN(last.getTime()) && last.getTime() < to.getTime()) {
      return { from: last, to };
    }
  }
  return { from: startOfLocalDay(to), to };
}

/** Current challenge period (day / week / month / once), not always local midnight. */
export function challengeHealthWindow(challenge?: {
  frequency?: string | null;
  starts_at?: string | null;
  lastLogAt?: string | null;
} | null): { from: Date; to: Date } {
  if (challenge?.lastLogAt) {
    return healthQueryWindow({ lastLogAt: challenge.lastLogAt });
  }
  const to = new Date();
  const freq = String(challenge?.frequency ?? 'daily').toLowerCase();
  let from: Date;
  if (freq === 'weekly' || freq === 'week' || freq === '3x_week') {
    from = startOfWeek(to, { weekStartsOn: 1 });
  } else if (freq === 'monthly' || freq === 'month') {
    from = startOfMonth(to);
  } else if (freq === 'once') {
    from = challenge?.starts_at ? new Date(challenge.starts_at) : startOfDay(to);
  } else {
    from = startOfDay(to);
  }
  if (Number.isNaN(from.getTime())) {
    from = startOfDay(to);
  }
  if (challenge?.starts_at) {
    const start = new Date(challenge.starts_at);
    if (!Number.isNaN(start.getTime()) && start > from) {
      from = start;
    }
  }
  if (from > to) {
    from = startOfDay(to);
  }
  return { from, to };
}

export function workoutOverlapsPeriod(
  workout: { startedAt: string; endedAt: string },
  period: { from: Date; to: Date },
): boolean {
  const start = new Date(workout.startedAt).getTime();
  const end = new Date(workout.endedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) {
    return false;
  }
  return start < period.to.getTime() && end > period.from.getTime();
}

export function meetsMinMinutes(durationSec: number, minMinutes?: number | null): boolean {
  const min = Number(minMinutes);
  if (!Number.isFinite(min) || min <= 1) {
    return true;
  }
  return durationSec >= min * 60;
}
