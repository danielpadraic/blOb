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
): Date {
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let date = new Date(guess);
  date = new Date(guess - zoneOffsetMs(date, timeZone));
  const again = zoneOffsetMs(date, timeZone);
  if (guess - again !== date.getTime()) {
    date = new Date(guess - again);
  }
  return date;
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
