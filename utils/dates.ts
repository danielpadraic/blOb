import { format } from 'date-fns';

/** Local calendar date as YYYY-MM-DD, matching Postgres `date`. */
export function localDateStamp(date: Date = new Date()): string {
  return format(date, 'yyyy-MM-dd');
}

/** UTC calendar date as YYYY-MM-DD. Matches log_workout uniqueness. */
export function utcDateStamp(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}
