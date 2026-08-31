import {
  challengeHasDailyCheckinDuty,
  challengeIsUnlimitedMiss,
  type MissDutyChallenge,
} from '@/lib/missDuty';
import {
  dateStampInZone,
  officialCurrentWindow,
  officialLogDate,
  OFFICIAL_SERIES_TIMEZONE,
  zonedWallTime,
  type OfficialDayWindowRow,
} from '@/lib/officialDays';
import { isOfficialSeriesChallenge } from '@/lib/officialSeries';

export type CheckinPeriodChallenge = MissDutyChallenge & {
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

export type RequiredPeriodWindow = {
  periodKey: string;
  endsAt: Date;
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

function periodStatusOpen(challenge?: CheckinPeriodChallenge | null, now = new Date()): boolean {
  if (!challenge) {
    return false;
  }
  const status = String(challenge.status ?? '').toLowerCase();
  if (status && status !== 'live' && status !== 'in_progress') {
    return false;
  }
  if (challenge.starts_at) {
    const start = new Date(challenge.starts_at);
    if (!Number.isNaN(start.getTime()) && now.getTime() < start.getTime()) {
      return false;
    }
  }
  return true;
}

/**
 * End of the current required check-in period.
 * Official: 11:59:59 p.m. America/Chicago (open window).
 * User-created daily consistency: that challenge’s timezone day end.
 * Hidden when this window has no required period (weekly / points / totals / LMS).
 */
export function currentRequiredPeriodWindow(
  challenge?: CheckinPeriodChallenge | null,
  now = new Date(),
): RequiredPeriodWindow | null {
  if (!challenge || challengeIsUnlimitedMiss(challenge) || !challengeHasDailyCheckinDuty(challenge)) {
    return null;
  }
  if (!periodStatusOpen(challenge, now)) {
    return null;
  }
  if (isOfficialSeriesChallenge(challenge)) {
    const window = officialCurrentWindow(challenge, now);
    if (!window || now.getTime() > window.endsAt.getTime()) {
      return null;
    }
    return { periodKey: normalizePeriodKey(window.date), endsAt: window.endsAt };
  }
  const tz = challengeClockTz(challenge);
  const key = normalizePeriodKey(dateStampInZone(now, tz));
  const endsAt = zonedWallTime(key, 23, 59, 59, 999, tz);
  if (challenge.ends_at) {
    const challengeEnd = new Date(challenge.ends_at);
    if (!Number.isNaN(challengeEnd.getTime()) && endsAt.getTime() > challengeEnd.getTime()) {
      return null;
    }
  }
  if (now.getTime() > endsAt.getTime()) {
    return null;
  }
  return { periodKey: key, endsAt };
}
