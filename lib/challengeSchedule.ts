import { addDays, addMonths, addWeeks, differenceInCalendarDays, differenceInHours, format } from 'date-fns';

import type { CreateChallengeValues } from '@/utils/validators';

export type ChallengeEndMode = 'date' | 'length';
export type ChallengeDurationUnit = 'days' | 'weeks' | 'months';
export type StartPreset = 'hour' | 'tomorrow' | 'custom';

export const MAX_CHALLENGE_DURATION_DAYS = 365;
export const MAX_DURATION_MESSAGE = 'Keep it to 365 days or less.';

export function defaultChallengeStart(now = new Date()): Date {
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setMinutes(0);
  next.setHours(next.getHours() + 1);
  if (next.getTime() <= now.getTime()) {
    next.setHours(next.getHours() + 1);
  }
  return next;
}

export function tomorrowMorning(now = new Date()): Date {
  const next = new Date(now);
  next.setDate(next.getDate() + 1);
  next.setHours(9, 0, 0, 0);
  return next;
}

export function inOneHour(now = new Date()): Date {
  const next = new Date(now.getTime() + 60 * 60 * 1000);
  next.setSeconds(0, 0);
  return next;
}

export function addChallengeLength(
  start: Date,
  value: number,
  unit: ChallengeDurationUnit,
): Date {
  const amount = Math.max(Math.floor(value) || 1, 1);
  if (unit === 'weeks') {
    return addWeeks(start, amount);
  }
  if (unit === 'months') {
    return addMonths(start, amount);
  }
  return addDays(start, amount);
}

export function maxChallengeEnd(start: Date): Date {
  return addDays(start, MAX_CHALLENGE_DURATION_DAYS);
}

export function clampChallengeEnd(start: Date, end: Date): Date {
  const maxEnd = maxChallengeEnd(start);
  return end.getTime() > maxEnd.getTime() ? maxEnd : end;
}

export function challengeLengthDays(
  start: Date,
  value: number,
  unit: ChallengeDurationUnit,
): number {
  return Math.max(differenceInCalendarDays(addChallengeLength(start, value, unit), start), 0);
}

export function parseScheduleDate(value: string | null | undefined): Date | null {
  if (!value || !String(value).trim()) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function asEndMode(value: unknown): ChallengeEndMode {
  return value === 'date' || value === 'end_date' ? 'date' : 'length';
}

export function publishEndMode(mode: ChallengeEndMode): 'end_date' | 'length' {
  return mode === 'date' ? 'end_date' : 'length';
}

export function withFreshSchedule(
  values: CreateChallengeValues,
  now = new Date(),
): CreateChallengeValues {
  const days = Math.max(Number(values.duration_days) || 7, 1);
  return {
    ...values,
    ...ensureSchedule(
      {
        starts_at: '',
        ends_at: '',
        end_mode: 'length',
        duration_value: values.duration_value || String(days),
        duration_unit: values.duration_unit || 'days',
        duration_days: String(days),
      },
      now,
    ),
  };
}

export function asDurationUnit(value: unknown): ChallengeDurationUnit {
  if (value === 'weeks' || value === 'months') {
    return value;
  }
  return 'days';
}

export function defaultSchedule(now = new Date()): Pick<
  CreateChallengeValues,
  'starts_at' | 'ends_at' | 'end_mode' | 'duration_value' | 'duration_unit' | 'duration_days'
> {
  const starts = defaultChallengeStart(now);
  const ends = addDays(starts, 7);
  return {
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    end_mode: 'length',
    duration_value: '7',
    duration_unit: 'days',
    duration_days: '7',
  };
}

export function durationDaysFromValues(values: {
  duration_value?: string | number | null;
  duration_days?: string | number | null;
  duration_unit?: unknown;
  starts_at?: string | null;
}): number {
  const unit = asDurationUnit(values.duration_unit);
  const amount = Math.max(Number(values.duration_value ?? values.duration_days) || 7, 1);
  if (unit === 'days') {
    return Math.min(Math.max(Math.floor(amount) || 1, 1), MAX_CHALLENGE_DURATION_DAYS);
  }
  const start = parseScheduleDate(values.starts_at) ?? defaultChallengeStart();
  return Math.min(Math.max(challengeLengthDays(start, amount, unit), 1), MAX_CHALLENGE_DURATION_DAYS);
}

/** ends_at = starts_at + N calendar days, same clock time. */
export function endsAtFromStartAndDays(startsAt: string | null | undefined, days: number): string {
  const start = parseScheduleDate(startsAt) ?? defaultChallengeStart();
  const n = Math.min(Math.max(Math.floor(days) || 1, 1), MAX_CHALLENGE_DURATION_DAYS);
  return addDays(start, n).toISOString();
}

export function formatChallengeEndLine(iso: string | null | undefined): string | null {
  const date = parseScheduleDate(iso);
  if (!date) {
    return null;
  }
  return `Ends ${format(date, 'EEEE, MMM d, yyyy')} at ${format(date, 'h:mm a')}.`;
}

export function ensureSchedule(
  values: Partial<CreateChallengeValues>,
  now = new Date(),
): Pick<
  CreateChallengeValues,
  'starts_at' | 'ends_at' | 'end_mode' | 'duration_value' | 'duration_unit' | 'duration_days'
> {
  const start = parseScheduleDate(values.starts_at) ?? defaultChallengeStart(now);
  const days = durationDaysFromValues({ ...values, starts_at: start.toISOString() });
  const end = addDays(start, days);
  return {
    starts_at: start.toISOString(),
    ends_at: end.toISOString(),
    end_mode: 'length',
    duration_value: String(days),
    duration_unit: 'days',
    duration_days: String(days),
  };
}

export function endsFromLength(
  startsAt: string,
  value: string | number,
  unit: ChallengeDurationUnit,
): string {
  const start = parseScheduleDate(startsAt) ?? defaultChallengeStart();
  const days = durationDaysFromValues({
    starts_at: start.toISOString(),
    duration_value: value,
    duration_unit: unit,
  });
  return endsAtFromStartAndDays(start.toISOString(), days);
}

export function scheduleRangeLabel(startsAt: string, endsAt: string): string {
  const start = parseScheduleDate(startsAt);
  const end = parseScheduleDate(endsAt);
  if (!start || !end) {
    return 'Set when this challenge starts and ends.';
  }
  return `Starts ${format(start, 'EEE, MMM d · h:mm a')} · Ends ${format(end, 'EEE, MMM d · h:mm a')}`;
}

export function scheduleSummary(startsAt: string, endsAt: string): string {
  const start = parseScheduleDate(startsAt);
  const end = parseScheduleDate(endsAt);
  if (!start || !end) {
    return 'Set when this challenge starts and ends.';
  }
  const startLabel = format(start, 'EEE h:mm a');
  const endLabel = format(end, 'EEE h:mm a');
  const days = differenceInCalendarDays(end, start);
  if (days >= 1) {
    return `Starts ${startLabel} · Ends in ${days} day${days === 1 ? '' : 's'} (${endLabel})`;
  }
  const hours = Math.max(differenceInHours(end, start), 1);
  return `Starts ${startLabel} · Ends in ${hours} hour${hours === 1 ? '' : 's'} (${endLabel})`;
}

export function formatScheduleDateTime(iso: string): string {
  const date = parseScheduleDate(iso);
  if (!date) {
    return 'Set date';
  }
  return format(date, 'EEE, MMM d · h:mm a');
}

export function startPresetFor(iso: string, now = new Date()): StartPreset {
  const date = parseScheduleDate(iso);
  if (!date) {
    return 'custom';
  }
  const hour = inOneHour(now).getTime();
  const morning = tomorrowMorning(now).getTime();
  const stamp = date.getTime();
  if (Math.abs(stamp - hour) < 2 * 60 * 1000) {
    return 'hour';
  }
  if (Math.abs(stamp - morning) < 2 * 60 * 1000) {
    return 'tomorrow';
  }
  return 'custom';
}

export function toLocalInputValue(iso: string): string {
  const date = parseScheduleDate(iso) ?? defaultChallengeStart();
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function fromLocalInputValue(value: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
