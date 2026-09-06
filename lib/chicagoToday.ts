/** Chicago calendar date. Matches `public.chicago_today()` after the Sep 6 2026 fix. */
export const CHICAGO_TZ = 'America/Chicago';

export function chicagoDateStamp(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: CHICAGO_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}
