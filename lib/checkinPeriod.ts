import {
  dateStampInZone,
  officialLogDate,
  OFFICIAL_SERIES_TIMEZONE,
  type OfficialDayWindowRow,
} from '@/lib/officialDays';
import { isOfficialSeriesChallenge } from '@/lib/officialSeries';

export type CheckinPeriodChallenge = {
  is_official?: boolean | null;
  series_id?: string | null;
  status?: string | null;
  starts_at?: string | null;
  timezone?: string | null;
  days_required?: number | null;
  target_count?: number | null;
  day_windows?: OfficialDayWindowRow[] | null;
};

/** YYYY-MM-DD from a date column, ISO timestamp, or already-stamped key. */
export function normalizePeriodKey(value: unknown): string {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? raw;
}

/** Mirrors `public.challenge_clock_tz`. */
export function challengeClockTz(challenge?: CheckinPeriodChallenge | null): string {
  if (challenge && isOfficialSeriesChallenge(challenge)) {
    const tz = challenge.timezone?.trim();
    return tz || OFFICIAL_SERIES_TIMEZONE;
  }
  const tz = challenge?.timezone?.trim();
  return tz || 'UTC';
}

/**
 * Current `period_key` — same rule as `public.checkin_period_for`.
 * Official series: open Chicago window date, else America/Chicago day.
 * User-created: that challenge’s timezone day (UTC if unset).
 */
export function checkinPeriodKey(
  challenge?: CheckinPeriodChallenge | null,
  now = new Date(),
): string {
  if (challenge && isOfficialSeriesChallenge(challenge)) {
    const windowDate = officialLogDate(challenge, now);
    if (windowDate) {
      return normalizePeriodKey(windowDate);
    }
  }
  return normalizePeriodKey(dateStampInZone(now, challengeClockTz(challenge)));
}

/** Nearby stamps to recover a submitted row when the client key is slightly off. */
export function checkinPeriodKeyCandidates(
  challenge?: CheckinPeriodChallenge | null,
  now = new Date(),
): string[] {
  const keys = new Set<string>();
  keys.add(checkinPeriodKey(challenge, now));
  if (challenge && isOfficialSeriesChallenge(challenge)) {
    const windowDate = officialLogDate(challenge, now);
    if (windowDate) {
      keys.add(normalizePeriodKey(windowDate));
    }
    keys.add(normalizePeriodKey(dateStampInZone(now, OFFICIAL_SERIES_TIMEZONE)));
  }
  const tz = challenge?.timezone?.trim();
  if (tz) {
    keys.add(normalizePeriodKey(dateStampInZone(now, tz)));
  }
  keys.add(normalizePeriodKey(dateStampInZone(now, 'UTC')));
  keys.add(normalizePeriodKey(dateStampInZone(now, challengeClockTz(challenge))));
  return [...keys].filter(Boolean);
}
