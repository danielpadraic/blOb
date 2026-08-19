import { isOfficialSeriesChallenge } from '@/lib/officialSeries';

export const OFFICIAL_SERIES_TIMEZONE = 'America/Chicago';

export type OfficialDayWindowRow = {
  day: number;
  date: string;
  starts_at: string;
  ends_at: string;
};

export type OfficialDayWindow = {
  day: number;
  date: string;
  startsAt: Date;
  endsAt: Date;
};

type OfficialWindowChallenge = {
  is_official?: boolean | null;
  series_id?: string | null;
  status?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  timezone?: string | null;
  days_required?: number | null;
  target_count?: number | null;
  day_windows?: OfficialDayWindowRow[] | null;
};

function asInt(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

function ymdInZone(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addDaysYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

function wallClockInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${pick('year')}-${pick('month')}-${pick('day')}T${pick('hour')}:${pick('minute')}:${pick('second')}`;
}

/** UTC instant for a wall clock in `timeZone`. */
export function zonedWallTime(
  ymd: string,
  hours: number,
  minutes: number,
  seconds: number,
  ms: number,
  timeZone: string,
): Date {
  const desired = `${ymd}T${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  let instant = Date.parse(`${desired}Z`);
  for (let i = 0; i < 4; i += 1) {
    const shown = wallClockInZone(new Date(instant), timeZone);
    instant += Date.parse(`${desired}Z`) - Date.parse(`${shown}Z`);
  }
  return new Date(instant + ms);
}

export function parseOfficialDayWindows(value: unknown): OfficialDayWindowRow[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((row) => {
      if (!row || typeof row !== 'object') {
        return null;
      }
      const rec = row as Record<string, unknown>;
      const day = asInt(rec.day, 0);
      const date = typeof rec.date === 'string' ? rec.date : '';
      const startsAt = typeof rec.starts_at === 'string' ? rec.starts_at : '';
      const endsAt = typeof rec.ends_at === 'string' ? rec.ends_at : '';
      if (day < 1 || !startsAt || !endsAt) {
        return null;
      }
      return { day, date, starts_at: startsAt, ends_at: endsAt };
    })
    .filter((row): row is OfficialDayWindowRow => Boolean(row))
    .sort((a, b) => a.day - b.day);
}

function hydrateWindow(row: OfficialDayWindowRow): OfficialDayWindow | null {
  const startsAt = new Date(row.starts_at);
  const endsAt = new Date(row.ends_at);
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    return null;
  }
  return {
    day: row.day,
    date: row.date || ymdInZone(startsAt, OFFICIAL_SERIES_TIMEZONE),
    startsAt,
    endsAt,
  };
}

/** Day 1 is [S, next CT calendar date 23:59:59.999]. Days 2–7 are CT midnights. */
export function computeOfficialDayWindows(
  startsAt: string | Date,
  timeZone = OFFICIAL_SERIES_TIMEZONE,
  days = 7,
): OfficialDayWindow[] {
  const start = startsAt instanceof Date ? startsAt : new Date(startsAt);
  if (Number.isNaN(start.getTime()) || days < 1) {
    return [];
  }
  const tz = timeZone.trim() || OFFICIAL_SERIES_TIMEZONE;
  const startDate = ymdInZone(start, tz);
  const windows: OfficialDayWindow[] = [
    {
      day: 1,
      date: startDate,
      startsAt: start,
      endsAt: zonedWallTime(addDaysYmd(startDate, 1), 23, 59, 59, 999, tz),
    },
  ];
  for (let day = 2; day <= days; day += 1) {
    const cal = addDaysYmd(startDate, day);
    windows.push({
      day,
      date: cal,
      startsAt: zonedWallTime(cal, 0, 0, 0, 0, tz),
      endsAt: zonedWallTime(cal, 23, 59, 59, 999, tz),
    });
  }
  return windows;
}

export function officialWindowsFor(
  challenge: OfficialWindowChallenge | null | undefined,
): OfficialDayWindow[] {
  if (!challenge || !isOfficialSeriesChallenge(challenge)) {
    return [];
  }
  const stored = parseOfficialDayWindows(challenge.day_windows)
    .map(hydrateWindow)
    .filter((row): row is OfficialDayWindow => Boolean(row));
  if (stored.length > 0) {
    return stored;
  }
  if (!challenge.starts_at) {
    return [];
  }
  const tz =
    challenge.timezone && challenge.timezone !== 'UTC'
      ? challenge.timezone
      : OFFICIAL_SERIES_TIMEZONE;
  const days = Math.max(asInt(challenge.days_required ?? challenge.target_count, 7), 1);
  return computeOfficialDayWindows(challenge.starts_at, tz, days);
}

export function officialWindowAt(
  windows: OfficialDayWindow[],
  now = new Date(),
): OfficialDayWindow | null {
  const t = now.getTime();
  return windows.find((window) => t >= window.startsAt.getTime() && t <= window.endsAt.getTime()) ?? null;
}

export function officialCurrentWindow(
  challenge: OfficialWindowChallenge | null | undefined,
  now = new Date(),
): OfficialDayWindow | null {
  return officialWindowAt(officialWindowsFor(challenge), now);
}

/** submission_date for this Official window. Null if no window is open. */
export function officialLogDate(
  challenge: OfficialWindowChallenge | null | undefined,
  now = new Date(),
): string | null {
  return officialCurrentWindow(challenge, now)?.date ?? null;
}

export function officialClosedWindowCount(
  challenge: OfficialWindowChallenge | null | undefined,
  now = new Date(),
): number {
  const t = now.getTime();
  return officialWindowsFor(challenge).filter((window) => t > window.endsAt.getTime()).length;
}

export function formatLocalClock(date: Date, timeZone?: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  }).format(date);
}

export function countdownTo(target: Date, now = new Date()): string | null {
  const ms = target.getTime() - now.getTime();
  if (ms <= 0) {
    return null;
  }
  const totalSec = Math.max(Math.ceil(ms / 1000), 0);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remH = hours % 24;
    return remH > 0 ? `${days}d ${remH}h` : `${days}d`;
  }
  if (hours >= 1) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes >= 1) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}
