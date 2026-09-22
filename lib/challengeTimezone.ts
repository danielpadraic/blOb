export const DEFAULT_CHALLENGE_TIMEZONE = 'America/Denver';

const CHALLENGE_ROUTE_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isChallengeRouteId(value: string): boolean {
  return CHALLENGE_ROUTE_ID.test(value.trim());
}

export function resolveChallengeTimezone(timeZone?: string | null): string {
  const named = String(timeZone ?? '').trim();
  if (named) {
    return named;
  }
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_CHALLENGE_TIMEZONE;
  } catch {
    return DEFAULT_CHALLENGE_TIMEZONE;
  }
}

type ZoneParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export function zonedParts(date: Date, timeZone: string): ZoneParts {
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hourCycle: 'h23',
      })
        .formatToParts(date)
        .map((part) => [part.type, part.value]),
    );
    const year = Number(parts.year);
    const month = Number(parts.month);
    const day = Number(parts.day);
    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
      throw new RangeError('Invalid time zone parts');
    }
    return {
      year,
      month,
      day,
      hour: Number(parts.hour) || 0,
      minute: Number(parts.minute) || 0,
      second: Number(parts.second) || 0,
    };
  } catch {
    return {
      year: date.getUTCFullYear(),
      month: date.getUTCMonth() + 1,
      day: date.getUTCDate(),
      hour: date.getUTCHours(),
      minute: date.getUTCMinutes(),
      second: date.getUTCSeconds(),
    };
  }
}

function zoneOffsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

export function zonedDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
  second = 0,
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, second, 0);
  let date = new Date(guess);
  date = new Date(guess - zoneOffsetMs(date, timeZone));
  const again = zoneOffsetMs(date, timeZone);
  if (guess - again !== date.getTime()) {
    date = new Date(guess - again);
  }
  return date;
}

export const CREATE_TIMEZONE_OPTIONS = [
  'America/Chicago',
  'America/Denver',
  'America/New_York',
  'America/Los_Angeles',
  'America/Phoenix',
  'Pacific/Honolulu',
  'UTC',
] as const;

export function endOfDayInZone(iso: string, timeZone?: string | null): string {
  const zone = resolveChallengeTimezone(timeZone);
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  const parts = zonedParts(date, zone);
  return zonedDateTimeToUtc(parts.year, parts.month, parts.day, 23, 59, zone, 59).toISOString();
}

export function toZonedInputValue(iso: string, timeZone?: string | null): string {
  const date = new Date(iso);
  const fallback = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = zonedParts(fallback, resolveChallengeTimezone(timeZone));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}`;
}

export function fromZonedInputValue(value: string, timeZone?: string | null): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(value ?? ''));
  if (!match) {
    return null;
  }
  return zonedDateTimeToUtc(
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
    Number(match[4]),
    Number(match[5]),
    resolveChallengeTimezone(timeZone),
  ).toISOString();
}

export function formatZonedDateTime(iso: string, timeZone?: string | null): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Set date';
  }
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: resolveChallengeTimezone(timeZone),
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function dateForZonedPicker(iso: string, timeZone?: string | null): Date {
  const date = new Date(iso);
  const fallback = Number.isNaN(date.getTime()) ? new Date() : date;
  const parts = zonedParts(fallback, resolveChallengeTimezone(timeZone));
  return new Date(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
}

export function isoFromZonedPicker(localDate: Date, timeZone?: string | null): string {
  return zonedDateTimeToUtc(
    localDate.getFullYear(),
    localDate.getMonth() + 1,
    localDate.getDate(),
    localDate.getHours(),
    localDate.getMinutes(),
    resolveChallengeTimezone(timeZone),
    localDate.getSeconds(),
  ).toISOString();
}

function addCalendarDay(year: number, month: number, day: number, amount: number): {
  year: number;
  month: number;
  day: number;
} {
  const next = new Date(Date.UTC(year, month - 1, day + amount));
  return {
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
  };
}

/** Next calendar date in `timeZone` at the given clock (default 00:00). Not +24h. */
export function startTomorrowInZone(
  now = new Date(),
  timeZone = resolveChallengeTimezone(),
  clock: { hours?: number; minutes?: number } = {},
): Date {
  const zone = resolveChallengeTimezone(timeZone);
  const parts = zonedParts(now, zone);
  const next = addCalendarDay(parts.year, parts.month, parts.day, 1);
  return zonedDateTimeToUtc(
    next.year,
    next.month,
    next.day,
    clock.hours ?? 0,
    clock.minutes ?? 0,
    zone,
  );
}

export function addZonedCalendarDays(startsAt: string, days: number, timeZone?: string | null): string {
  const zone = resolveChallengeTimezone(timeZone);
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) {
    return startsAt;
  }
  const parts = zonedParts(start, zone);
  const next = addCalendarDay(parts.year, parts.month, parts.day, Math.max(Math.floor(days) || 1, 1));
  return zonedDateTimeToUtc(next.year, next.month, next.day, parts.hour, parts.minute, zone).toISOString();
}
