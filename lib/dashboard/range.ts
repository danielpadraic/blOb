import { dateStampInZone } from '@/lib/officialDays';

export type DashboardRange = 'today' | 'week' | 'month' | 'year';

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

/** Inclusive calendar days for the range, ending today in `timeZone`. Newest last. */
export function rangeDayKeys(range: DashboardRange, now: Date, timeZone: string): string[] {
  const zone = dashboardZone(timeZone);
  if (!zone) {
    return [];
  }
  const today = dateStampInZone(now, zone);
  if (range === 'today') {
    return [today];
  }
  const span = range === 'week' ? 7 : range === 'month' ? 30 : 365;
  const keys: string[] = [];
  for (let back = span - 1; back >= 0; back -= 1) {
    keys.push(addDaysYmd(today, -back));
  }
  return keys;
}

export function dayInRange(day: string, keys: readonly string[]): boolean {
  return Boolean(day) && keys.includes(day);
}
