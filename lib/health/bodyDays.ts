import { dateStampInZone } from '@/lib/officialDays';

export type BodyProvider = 'apple_health' | 'health_connect';

/** One calendar day of body numbers. Missing fields mean the platform did not return them. */
export type BodyDay = {
  day: string;
  provider?: BodyProvider | null;
  steps?: number | null;
  calories?: number | null;
  standHours?: number | null;
  moveKcal?: number | null;
  exerciseMin?: number | null;
  sleepMin?: number | null;
  heartRate?: number | null;
};

export type BodyPointKind =
  | 'steps'
  | 'calories'
  | 'standMin'
  | 'moveKcal'
  | 'exerciseMin'
  | 'sleepMin'
  | 'heart';

export type BodyPoint = {
  at: string;
  value: number;
  kind: BodyPointKind;
};

export function mergeBodyDays(stored: readonly BodyDay[], fresh: readonly BodyDay[]): BodyDay[] {
  const map = new Map(stored.map((day) => [day.day, { ...day }]));
  for (const day of fresh) {
    const prev = map.get(day.day);
    map.set(day.day, {
      day: day.day,
      provider: day.provider ?? prev?.provider ?? null,
      steps: positiveNumber(day.steps) ?? prev?.steps ?? null,
      calories: positiveNumber(day.calories) ?? prev?.calories ?? null,
      standHours: positiveNumber(day.standHours) ?? prev?.standHours ?? null,
      moveKcal: positiveNumber(day.moveKcal) ?? prev?.moveKcal ?? null,
      exerciseMin: positiveNumber(day.exerciseMin) ?? prev?.exerciseMin ?? null,
      sleepMin: positiveNumber(day.sleepMin) ?? prev?.sleepMin ?? null,
      heartRate: positiveNumber(day.heartRate) ?? prev?.heartRate ?? null,
    });
  }
  return [...map.values()];
}

export function positiveNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

type Bucket = BodyDay & { heartSum: number; heartCount: number; exerciseSeen: Map<string, number> };

function zonedDayHour(date: Date, timeZone: string): { day: string; hour: number } | null {
  const day = dateStampInZone(date, timeZone);
  if (!day) {
    return null;
  }
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    if (!Number.isFinite(hour)) {
      return null;
    }
    return { day, hour };
  } catch {
    return null;
  }
}

/**
 * Group samples into calendar days in `timeZone`.
 * Stand samples are minutes and become hours. Heart rate is an average, not a sum.
 * UTC is refused so a day is never stamped from Greenwich.
 */
export function bucketBodyPoints(
  points: readonly BodyPoint[],
  timeZone: string,
  provider?: BodyProvider | null,
): BodyDay[] {
  const zone = String(timeZone ?? '').trim();
  if (!zone || zone.toUpperCase() === 'UTC') {
    return [];
  }
  const days = new Map<string, Bucket>();
  const standMinutes = new Map<string, number>();
  for (const point of points) {
    const value = positiveNumber(point.value);
    const at = new Date(point.at);
    if (!value || Number.isNaN(at.getTime())) {
      continue;
    }
    const placed = zonedDayHour(at, zone);
    if (!placed) {
      continue;
    }
    const { day, hour } = placed;
    const row =
      days.get(day) ??
      ({
        day,
        provider: provider ?? null,
        heartSum: 0,
        heartCount: 0,
        exerciseSeen: new Map<string, number>(),
      } satisfies Bucket);
    if (point.kind === 'heart') {
      row.heartSum += value;
      row.heartCount += 1;
    } else if (point.kind === 'standMin') {
      const key = `${day}|${hour}`;
      standMinutes.set(key, Math.min(60, (standMinutes.get(key) ?? 0) + value));
    } else if (point.kind === 'exerciseMin') {
      const minute = Math.floor(at.getTime() / 60000);
      const key = `${day}|${minute}`;
      row.exerciseSeen.set(key, Math.max(row.exerciseSeen.get(key) ?? 0, value));
    } else if (point.kind === 'steps') {
      row.steps = (row.steps ?? 0) + value;
    } else if (point.kind === 'calories') {
      row.calories = (row.calories ?? 0) + value;
    } else if (point.kind === 'moveKcal') {
      row.moveKcal = (row.moveKcal ?? 0) + value;
    } else if (point.kind === 'sleepMin') {
      row.sleepMin = (row.sleepMin ?? 0) + value;
    }
    days.set(day, row);
  }
  const standByDay = new Map<string, number>();
  for (const [key, minutes] of standMinutes) {
    const day = key.slice(0, 10);
    standByDay.set(day, (standByDay.get(day) ?? 0) + Math.min(1, minutes / 60));
  }
  return [...days.values()]
    .map((row) => {
      const exercise = [...row.exerciseSeen.values()].reduce((sum, value) => sum + value, 0);
      return {
        day: row.day,
        provider: row.provider ?? null,
        steps: positiveNumber(row.steps),
        calories: positiveNumber(row.calories),
        standHours: positiveNumber(Math.min(24, standByDay.get(row.day) ?? 0)),
        moveKcal: positiveNumber(row.moveKcal),
        exerciseMin: positiveNumber(Math.min(24 * 60, exercise)),
        sleepMin: positiveNumber(row.sleepMin),
        heartRate: row.heartCount > 0 ? Math.round(row.heartSum / row.heartCount) : null,
      };
    })
    .sort((a, b) => a.day.localeCompare(b.day));
}

/** Asleep stages win. In-bed is used only when no asleep stage came back. */
export function sleepMinutesFromSamples(
  samples: readonly { start?: string | null; end?: string | null; value?: string | null }[],
): { at: string; minutes: number }[] {
  const tagged = samples
    .map((sample) => {
      const start = Date.parse(String(sample.start ?? ''));
      const end = Date.parse(String(sample.end ?? ''));
      const minutes = Number.isFinite(start) && Number.isFinite(end) && end > start ? (end - start) / 60000 : 0;
      const value = String(sample.value ?? '').toUpperCase().replace(/[\s_]/g, '');
      const asleep = value === 'ASLEEP' || value.startsWith('ASLEEP') || value === 'CORE' || value === 'DEEP' || value === 'REM';
      const inBed = value === 'INBED';
      return { at: String(sample.start ?? ''), minutes, asleep, inBed };
    })
    .filter((row) => row.minutes > 0 && row.at);
  const asleep = tagged.filter((row) => row.asleep);
  const chosen = asleep.length > 0 ? asleep : tagged.filter((row) => row.inBed);
  return chosen.map((row) => ({ at: row.at, minutes: row.minutes }));
}
