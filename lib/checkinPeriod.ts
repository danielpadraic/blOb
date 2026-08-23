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
      return windowDate;
    }
  }
  return dateStampInZone(now, challengeClockTz(challenge));
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
      keys.add(windowDate);
    }
    keys.add(dateStampInZone(now, OFFICIAL_SERIES_TIMEZONE));
  }
  const tz = challenge?.timezone?.trim();
  if (tz) {
    keys.add(dateStampInZone(now, tz));
  }
  keys.add(dateStampInZone(now, 'UTC'));
  return [...keys];
}
