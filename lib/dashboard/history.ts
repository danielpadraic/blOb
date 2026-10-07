import { formatHealthDuration } from '@/lib/health/durationChip';
import { formatMassLabel } from '@/lib/lift/massUnit';
import type { WeightUnit } from '@/lib/types';

export type HistoryHealth = {
  day: string;
  activity: string;
  durationSec: number;
  hrAvg?: number | null;
  distanceMeters?: number | null;
  href?: string | null;
};

export type HistoryLift = {
  day: string;
  title: string;
  pounds: number;
  unit: WeightUnit;
  href: string;
};

export type HistoryCardio = {
  day: string;
  typeLabel: string;
  seconds: number;
  distanceMeters?: number | null;
};

export type WorkoutHistoryLine = {
  kind: 'health' | 'lift' | 'cardio';
  text: string;
};

/** One completed day. Empty days are not rows. */
export type WorkoutHistoryDay = {
  day: string;
  label: string;
  lines: WorkoutHistoryLine[];
  href: string | null;
};

function miles(meters?: number | null): string {
  const value = Number(meters);
  if (!Number.isFinite(value) || value <= 0) {
    return '';
  }
  return `${(value / 1609.344).toFixed(2)} mi`;
}

function activityName(raw: string): string {
  const text = raw.trim();
  if (!text) {
    return 'Workout';
  }
  if (text !== text.toLowerCase()) {
    return text;
  }
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function dayLabel(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!match) {
    return ymd;
  }
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12));
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function healthLine(row: HistoryHealth): string {
  const hr = Number(row.hrAvg);
  return [
    activityName(row.activity),
    formatHealthDuration(row.durationSec) ?? '',
    Number.isFinite(hr) && hr > 0 ? `${Math.round(hr)} bpm` : '',
    miles(row.distanceMeters),
  ]
    .filter(Boolean)
    .join(' · ');
}

function liftLine(row: HistoryLift): string {
  const title = row.title.trim() || 'Lift';
  const pounds = Number(row.pounds);
  if (!Number.isFinite(pounds) || pounds <= 0) {
    return title;
  }
  return `${title} · ${formatMassLabel(pounds, row.unit, Math.round(pounds).toLocaleString('en-US'))}`;
}

function cardioLine(row: HistoryCardio): string {
  const time = formatHealthDuration(row.seconds) ?? '';
  return [row.typeLabel.trim() || 'Cardio', miles(row.distanceMeters), time].filter(Boolean).join(' · ');
}

/**
 * One row per completed day in the selected window.
 * Health, a finished Lift, and a cardio block share that day. Days with none of them are omitted.
 */
export function workoutHistoryDays(input: {
  health: readonly HistoryHealth[];
  lifts: readonly HistoryLift[];
  cardio: readonly HistoryCardio[];
}): WorkoutHistoryDay[] {
  const days = new Map<string, WorkoutHistoryDay>();
  const ensure = (day: string) => {
    const key = day.trim();
    const existing = days.get(key);
    if (existing) {
      return existing;
    }
    const next: WorkoutHistoryDay = { day: key, label: dayLabel(key), lines: [], href: null };
    days.set(key, next);
    return next;
  };

  const seenHealth = new Set<string>();
  for (const row of input.health) {
    if (!row.day) {
      continue;
    }
    const stamp = `${row.day}|${activityName(row.activity)}|${Math.round(Number(row.durationSec) || 0)}`;
    if (seenHealth.has(stamp)) {
      const existing = ensure(row.day);
      if (!existing.href && row.href) {
        existing.href = row.href;
      }
      continue;
    }
    const text = healthLine(row);
    if (!text) {
      continue;
    }
    seenHealth.add(stamp);
    const bucket = ensure(row.day);
    bucket.lines.push({ kind: 'health', text });
    if (!bucket.href && row.href) {
      bucket.href = row.href;
    }
  }

  for (const row of input.lifts) {
    if (!row.day || !row.title.trim()) {
      continue;
    }
    const bucket = ensure(row.day);
    bucket.lines.push({ kind: 'lift', text: liftLine(row) });
    if (!bucket.href && row.href) {
      bucket.href = row.href;
    }
  }

  for (const row of input.cardio) {
    if (!row.day || !(Number(row.seconds) > 0)) {
      continue;
    }
    ensure(row.day).lines.push({ kind: 'cardio', text: cardioLine(row) });
  }

  return [...days.values()]
    .filter((row) => row.lines.length > 0)
    .sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}
