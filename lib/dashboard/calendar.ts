import { dateStampInZone } from '@/lib/officialDays';

import { dashboardZone, rangeDayKeys, type CustomRange, type DashboardRange } from '@/lib/dashboard/range';

export type DayMark = 'empty' | 'done' | 'miss' | 'due';

export type CalendarDuty = {
  /** First day a check-in was required, inclusive. */
  startKey: string;
  /** Last day a check-in was required, inclusive. Never after today in this duty's zone. */
  endKey: string;
  todayKey: string;
  complete: readonly string[];
};

export type CalendarCell = {
  key: string | null;
  numeral: string;
  weekday: string;
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function addDaysYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

function mondayIndex(ymd: string): number {
  const [year, month, day] = ymd.split('-').map(Number);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return dow === 0 ? 6 : dow - 1;
}

/** Weekday of a calendar date. The stamp is already a local day, so it is not read as a UTC clock. */
export function weekdayLetter(ymd: string): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(date).slice(0, 1);
  } catch {
    return '';
  }
}

function numeral(ymd: string): string {
  return String(Number(ymd.slice(8, 10)) || '');
}

/** Days of the calendar month that contains `now` in `timeZone`. */
export function monthKeys(now: Date, timeZone: string): string[] {
  const zone = dashboardZone(timeZone);
  if (!zone) {
    return [];
  }
  const today = dateStampInZone(now, zone);
  const [year, month] = today.split('-');
  const start = `${year}-${month}-01`;
  const next = month === '12' ? `${Number(year) + 1}-01-01` : `${year}-${pad(Number(month) + 1)}-01`;
  const keys: string[] = [];
  let cursor = start;
  while (cursor < next && keys.length < 31) {
    keys.push(cursor);
    cursor = addDaysYmd(cursor, 1);
  }
  return keys;
}

export function calendarDayKeys(
  range: DashboardRange,
  now: Date,
  timeZone: string,
  custom?: CustomRange | null,
): string[] {
  const zone = dashboardZone(timeZone);
  if (!zone) {
    return [];
  }
  if (range === 'month') {
    return monthKeys(now, zone);
  }
  if (range === 'year') {
    const today = dateStampInZone(now, zone);
    const year = today.slice(0, 4);
    const start = `${year}-01-01`;
    const keys: string[] = [];
    let cursor = start;
    while (cursor <= today && keys.length < 366) {
      keys.push(cursor);
      cursor = addDaysYmd(cursor, 1);
    }
    return keys;
  }
  return rangeDayKeys(range, now, zone, custom);
}

export function calendarCells(
  range: DashboardRange,
  now: Date,
  timeZone: string,
  custom?: CustomRange | null,
): { cells: CalendarCell[]; showHeader: boolean } {
  const zone = dashboardZone(timeZone);
  const keys = calendarDayKeys(range, now, timeZone, custom);
  if (!zone || keys.length === 0) {
    return { cells: [], showHeader: false };
  }
  const showHeader = range === 'month' || range === 'year';
  const lead = showHeader ? mondayIndex(keys[0] ?? '') : 0;
  const pads: CalendarCell[] = Array.from({ length: lead }, () => ({ key: null, numeral: '', weekday: '' }));
  const cells = keys.map((key) => ({
    key,
    numeral: numeral(key),
    weekday: weekdayLetter(key),
  }));
  return { cells: [...pads, ...cells], showHeader };
}

/**
 * Mark a calendar day from live duties.
 * Complete proof marks the day. A past day that was still required and unfinished is a miss.
 * Today can be due without being a miss. A day with nothing due stays empty.
 */
export function markCalendarDay(day: string, duties: readonly CalendarDuty[]): DayMark {
  let due = false;
  let miss = false;
  let open = false;
  let finished = 0;
  for (const duty of duties) {
    if (!day || day < duty.startKey || day > duty.endKey) {
      continue;
    }
    due = true;
    if (duty.complete.includes(day)) {
      finished += 1;
      continue;
    }
    if (day < duty.todayKey) {
      miss = true;
    } else {
      open = true;
    }
  }
  if (!due) {
    return 'empty';
  }
  if (miss) {
    return 'miss';
  }
  if (open) {
    return 'due';
  }
  return finished > 0 ? 'done' : 'empty';
}

export function dutyBounds(input: {
  startAt?: string | null;
  endAt?: string | null;
  joinedAt?: string | null;
  eliminatedAt?: string | null;
  timeZone: string;
  now: Date;
}): { startKey: string; endKey: string; todayKey: string } | null {
  const zone = dashboardZone(input.timeZone);
  if (!zone) {
    return null;
  }
  const todayKey = dateStampInZone(input.now, zone);
  const startKey = input.startAt ? dateStampInZone(new Date(input.startAt), zone) : todayKey;
  const joinedKey = input.joinedAt ? dateStampInZone(new Date(input.joinedAt), zone) : startKey;
  const from = joinedKey > startKey ? joinedKey : startKey;
  let endKey = todayKey;
  if (input.endAt) {
    const end = new Date(input.endAt);
    if (!Number.isNaN(end.getTime())) {
      const last = dateStampInZone(new Date(end.getTime() - 1), zone);
      if (last && last < endKey) {
        endKey = last;
      }
    }
  }
  if (input.eliminatedAt) {
    const gone = dateStampInZone(new Date(input.eliminatedAt), zone);
    const last = addDaysYmd(gone, -1);
    if (last < endKey) {
      endKey = last;
    }
  }
  if (!from || !endKey || from > endKey) {
    return null;
  }
  return { startKey: from, endKey, todayKey };
}
