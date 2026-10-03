import { durationLabel } from '@/lib/dashboard/model';
import { positiveNumber, type BodyDay, type BodyProvider } from '@/lib/health/bodyDays';
import { formatCompletedDay } from '@/lib/health/workoutWhen';

export type DashboardSource = 'healthkit' | 'health_connect' | 'lift' | 'checkin';

export type DayBar = { key: string; label: string; value: number };

export type SessionRow = {
  id: string;
  title: string;
  start: string;
  end: string;
  day: string;
  sources: DashboardSource[];
  distanceMeters: number | null;
  pounds: number;
  href: string | null;
};

export type BodyCard = {
  key: string;
  title: string;
  valueLabel: string;
  bars: DayBar[];
  source: DashboardSource | null;
};

const MILES_PER_METER = 1 / 1609.344;

export function dayBars(
  keys: readonly string[],
  values: Map<string, number>,
  label: (day: string) => string,
): DayBar[] {
  const series = keys.map((key) => ({
    key,
    label: label(key),
    value: values.get(key) ?? 0,
  }));
  return series.some((day) => day.value > 0) ? series : [];
}

/** Wall-clock time that is not a cardio block, plus cardio on its own. A watch workout is not an input. */
export function liftAndCardioSeconds(input: {
  performedAt?: string | null;
  completedAt?: string | null;
  cardioSeconds?: number | null;
}): { lift: number; cardio: number } {
  const cardio = Math.max(0, Math.round(Number(input.cardioSeconds) || 0));
  const start = Date.parse(String(input.performedAt ?? ''));
  const end = Date.parse(String(input.completedAt ?? ''));
  const wall =
    Number.isFinite(start) && Number.isFinite(end) && end > start ? Math.round((end - start) / 1000) : 0;
  const lift = wall > cardio ? wall - cardio : cardio === 0 ? wall : 0;
  return { lift, cardio };
}

/** Lift pounds only. A watch workout is not an input. */
export function poundsByDay(rows: readonly { day: string; pounds: number }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const pounds = positiveNumber(row.pounds);
    if (!row.day || !pounds) {
      continue;
    }
    map.set(row.day, (map.get(row.day) ?? 0) + pounds);
  }
  return map;
}

/** One mark per Chicago-or-device day that has a blOb check-in. Extra rows do not stack. */
export function checkinDayMarks(days: readonly string[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const day of days) {
    if (day) {
      map.set(day, 1);
    }
  }
  return map;
}

function watchHealth(part: { health?: { source?: string } | null }): boolean {
  const source = String(part.health?.source ?? '');
  return source === 'healthkit' || source === 'health_connect';
}

/** Miles and steps the person typed. A watch distance or step count stays out. */
export function enteredFromParts(parts: unknown): { miles: number; steps: number } {
  if (!parts || typeof parts !== 'object') {
    return { miles: 0, steps: 0 };
  }
  let miles = 0;
  let steps = 0;
  for (const value of Object.values(parts as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') {
      continue;
    }
    const part = value as {
      method?: string;
      text?: string;
      distanceMeters?: number;
      health?: { source?: string; steps?: number; distanceMeters?: number } | null;
    };
    if (watchHealth(part)) {
      continue;
    }
    if (part.method === 'steps') {
      const typed = positiveNumber(String(part.text ?? '').replace(/,/g, ''));
      if (typed) {
        steps += typed;
      }
    }
    if (part.method === 'distance') {
      const meters = positiveNumber(part.distanceMeters);
      if (meters) {
        miles += meters * MILES_PER_METER;
      } else {
        const typed = positiveNumber(String(part.text ?? '').replace(/mi|miles|,/gi, '').trim());
        if (typed) {
          miles += typed;
        }
      }
    }
  }
  return { miles, steps };
}

/** The first real distance. A second distance is dropped, never added. */
export function oneDistance(primary: number | null | undefined, extra: number | null | undefined): number | null {
  return positiveNumber(primary) ?? positiveNumber(extra);
}

function hasHealth(row: SessionRow): boolean {
  return row.sources.includes('healthkit') || row.sources.includes('health_connect');
}

function hasLift(row: SessionRow): boolean {
  return row.sources.includes('lift');
}

function overlaps(a: SessionRow, b: SessionRow): boolean {
  const a0 = Date.parse(a.start);
  const a1 = Date.parse(a.end);
  const b0 = Date.parse(b.start);
  const b1 = Date.parse(b.end);
  if (![a0, a1, b0, b1].every((n) => Number.isFinite(n))) {
    return false;
  }
  return a0 < a1 && b0 < b1 && a0 < b1 && b0 < a1;
}

function uniqSources(sources: readonly DashboardSource[]): DashboardSource[] {
  const out: DashboardSource[] = [];
  for (const source of sources) {
    if (!out.includes(source)) {
      out.push(source);
    }
  }
  return out;
}

/**
 * A Lift block and a Health workout that share a clock become one row.
 * The clock is the health window. Distances are not added. Pounds stay the lift total.
 */
export function mergeLiftHealthSessions(rows: readonly SessionRow[]): SessionRow[] {
  const usedHealth = new Set<number>();
  const out: SessionRow[] = [];
  rows.forEach((row, index) => {
    if (!hasLift(row)) {
      return;
    }
    let merged: SessionRow = { ...row, sources: uniqSources(row.sources), pounds: positiveNumber(row.pounds) ?? 0 };
    for (let otherIndex = 0; otherIndex < rows.length; otherIndex += 1) {
      if (otherIndex === index || usedHealth.has(otherIndex)) {
        continue;
      }
      const other = rows[otherIndex];
      if (!other || !hasHealth(other) || hasLift(other) || !overlaps(merged, other)) {
        continue;
      }
      usedHealth.add(otherIndex);
      merged = {
        ...merged,
        start: other.start,
        end: other.end,
        sources: uniqSources([...merged.sources, ...other.sources]),
        distanceMeters: oneDistance(merged.distanceMeters, other.distanceMeters),
        href: merged.href ?? other.href,
        title: merged.title || other.title,
      };
      break;
    }
    out.push(merged);
  });
  rows.forEach((row, index) => {
    if (hasLift(row) || usedHealth.has(index)) {
      return;
    }
    out.push({ ...row, sources: uniqSources(row.sources) });
  });
  return out;
}

/** Same health window from a check-in and from the phone snapshot is one row. */
export function dedupeHealthSessions(rows: readonly SessionRow[]): SessionRow[] {
  const out: SessionRow[] = [];
  const indexByKey = new Map<string, number>();
  for (const row of rows) {
    const key = hasHealth(row) && !hasLift(row) ? `${row.sources.join(',')}|${row.start}|${row.end}` : row.id;
    const existing = indexByKey.get(key);
    if (existing == null) {
      indexByKey.set(key, out.length);
      out.push({ ...row });
      continue;
    }
    const prev = out[existing];
    if (prev && !prev.href && row.href) {
      prev.href = row.href;
    }
  }
  return out;
}

export function sessionVisible(row: { sources: readonly DashboardSource[] }, source: DashboardSource | null): boolean {
  if (!source) {
    return true;
  }
  return row.sources.includes(source);
}

function chipFor(provider?: BodyProvider | null): DashboardSource | null {
  if (provider === 'apple_health') {
    return 'healthkit';
  }
  if (provider === 'health_connect') {
    return 'health_connect';
  }
  return null;
}

function sumDays(days: readonly BodyDay[], pick: (day: BodyDay) => number | null | undefined): number {
  return days.reduce((sum, day) => sum + (positiveNumber(pick(day)) ?? 0), 0);
}

function newestSource(days: readonly BodyDay[], pick: (day: BodyDay) => number | null | undefined): DashboardSource | null {
  const hit = [...days].reverse().find((day) => positiveNumber(pick(day)));
  return chipFor(hit?.provider);
}

export function bodyCards(
  days: readonly BodyDay[],
  keys: readonly string[],
  label: (day: string) => string,
): BodyCard[] {
  const inRange = days.filter((day) => keys.includes(day.day));
  const specs: Array<{
    key: string;
    title: string;
    pick: (day: BodyDay) => number | null | undefined;
    format: (total: number) => string;
    average?: boolean;
  }> = [
    { key: 'steps', title: 'Steps', pick: (day) => day.steps, format: (total) => Math.round(total).toLocaleString('en-US') },
    { key: 'calories', title: 'Calories', pick: (day) => day.calories, format: (total) => `${Math.round(total)} cal` },
    { key: 'stand', title: 'Stand', pick: (day) => day.standHours, format: (total) => `${Math.round(total)} hr` },
    { key: 'move', title: 'Move', pick: (day) => day.moveKcal, format: (total) => `${Math.round(total)} cal` },
    {
      key: 'exercise',
      title: 'Exercise',
      pick: (day) => day.exerciseMin,
      format: (total) => `${Math.round(total)} min`,
    },
    { key: 'sleep', title: 'Sleep', pick: (day) => day.sleepMin, format: (total) => durationLabel(total * 60) },
    {
      key: 'heart',
      title: 'Heart rate',
      pick: (day) => day.heartRate,
      format: (total) => `${Math.round(total)} bpm`,
      average: true,
    },
  ];
  const cards: BodyCard[] = [];
  for (const spec of specs) {
    const values = new Map<string, number>();
    const samples: number[] = [];
    for (const day of inRange) {
      const value = positiveNumber(spec.pick(day));
      if (!value) {
        continue;
      }
      values.set(day.day, (values.get(day.day) ?? 0) + value);
      samples.push(value);
    }
    if (samples.length === 0) {
      continue;
    }
    const total = spec.average ? samples.reduce((sum, value) => sum + value, 0) / samples.length : sumDays(inRange, spec.pick);
    const valueLabel = spec.format(total);
    if (!valueLabel) {
      continue;
    }
    cards.push({
      key: spec.key,
      title: spec.title,
      valueLabel,
      bars: dayBars(keys, values, label),
      source: newestSource(inRange, spec.pick),
    });
  }
  const move = cards.find((card) => card.key === 'move');
  const calories = cards.find((card) => card.key === 'calories');
  if (move && calories) {
    const moveTotal = sumDays(inRange, (day) => day.moveKcal);
    const calorieTotal = sumDays(inRange, (day) => day.calories);
    if (Math.round(moveTotal) === Math.round(calorieTotal)) {
      return cards.filter((card) => card.key !== 'calories');
    }
  }
  return cards;
}

/** Web label for the last phone write. Blank when the clock is missing or the zone is UTC. */
export function syncDayLabel(syncedAt: string | null | undefined, timeZone: string): string {
  const zone = String(timeZone ?? '').trim();
  if (!zone || zone.toUpperCase() === 'UTC') {
    return '';
  }
  const day = formatCompletedDay(syncedAt, zone);
  return day ? `Synced ${day}` : '';
}
