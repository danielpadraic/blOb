import { dateStampInZone } from '@/lib/officialDays';

export type DashboardRange = 'today' | 'week' | 'last7' | 'month' | 'last30' | 'year' | 'custom';

export type CustomRange = { start: string; end: string };

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function addDaysYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

/** Device zone. Empty when the only zone on offer is UTC. */
export function dashboardZone(preferred?: string | null): string {
  const named = String(preferred ?? '').trim();
  if (named && named.toUpperCase() !== 'UTC') {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: named }).format(new Date());
      return named;
    } catch {
      // Fall through to the device.
    }
  }
  try {
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    return device.toUpperCase() === 'UTC' ? '' : device;
  } catch {
    return '';
  }
}

const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Inclusive calendar days for the range, ending today in `timeZone`. Newest last. */
export function rangeDayKeys(
  range: DashboardRange,
  now: Date,
  timeZone: string,
  custom?: CustomRange | null,
): string[] {
  const zone = dashboardZone(timeZone);
  if (!zone) {
    return [];
  }
  const today = dateStampInZone(now, zone);
  if (range === 'custom') {
    const start = String(custom?.start ?? '');
    const end = String(custom?.end ?? '');
    if (!YMD.test(start) || !YMD.test(end) || start > end) {
      return [];
    }
    const keys: string[] = [];
    let cursor = start;
    while (cursor <= end && keys.length < 366) {
      keys.push(cursor);
      cursor = addDaysYmd(cursor, 1);
    }
    return keys;
  }
  if (range === 'today') {
    return [today];
  }
  if (range === 'week') {
    return weekKeys(today);
  }
  if (range === 'month') {
    return monthKeys(today);
  }
  const span = range === 'last7' ? 7 : range === 'last30' ? 30 : 365;
  const keys: string[] = [];
  for (let back = span - 1; back >= 0; back -= 1) {
    keys.push(addDaysYmd(today, -back));
  }
  return keys;
}

/** Sunday 12:00 a.m. through Saturday, in the zone that produced `today`. */
export function weekKeys(today: string): string[] {
  const [year, month, day] = today.split('-').map(Number);
  const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const start = addDaysYmd(today, -dow);
  return Array.from({ length: 7 }, (_, index) => addDaysYmd(start, index));
}

/** The 1st through the last day of the month that contains `today`. */
export function monthKeys(today: string): string[] {
  const [year, month] = today.split('-').map(Number);
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const start = `${year}-${pad(month)}-01`;
  return Array.from({ length: last }, (_, index) => addDaysYmd(start, index));
}

export function dayInRange(day: string, keys: readonly string[]): boolean {
  return Boolean(day) && keys.includes(day);
}
