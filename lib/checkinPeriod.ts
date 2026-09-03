import {
  challengeHasDailyCheckinDuty,
  challengeIsUnlimitedMiss,
  type MissDutyChallenge,
} from '@/lib/missDuty';
import {
  DEFAULT_CHALLENGE_TIMEZONE,
  zonedDateTimeToUtc,
  zonedParts,
} from '@/lib/challengeTimezone';
import {
  dateStampInZone,
  officialCurrentWindow,
  officialLogDate,
  OFFICIAL_SERIES_TIMEZONE,
  zonedWallTime,
  type OfficialDayWindowRow,
} from '@/lib/officialDays';
import { isOfficialSeriesChallenge } from '@/lib/officialSeries';

const DAY_MS = 24 * 60 * 60 * 1000;

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

export type ConsistencyPeriodSlice = {
  periodKey: string;
  startsAt: Date;
  endsAt: Date;
};

/** YYYY-MM-DD from a date column, ISO timestamp, or already-stamped key. */
export function normalizePeriodKey(value: unknown): string {
  const raw = String(value ?? '').trim();
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return match?.[1] ?? raw;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function addYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

function startsAtLocalMidnight(startsAt: Date, timeZone: string): boolean {
  const parts = zonedParts(startsAt, timeZone);
  return parts.hour === 0 && parts.minute === 0 && parts.second === 0;
}

/** Mirrors `public.challenge_clock_tz`. Host tz; user-created default America/Denver. */
export function challengeClockTz(challenge?: CheckinPeriodChallenge | null): string {
  if (challenge && isOfficialSeriesChallenge(challenge)) {
    const tz = challenge.timezone?.trim();
    return tz || OFFICIAL_SERIES_TIMEZONE;
  }
  const tz = challenge?.timezone?.trim();
  return tz || DEFAULT_CHALLENGE_TIMEZONE;
}

/**
 * User-created consistency window at `now`.
 * Local-midnight `starts_at` → calendar dates in challenge tz.
 * Otherwise exact 24h slices from `starts_at`.
 */
export function consistencyPeriodAt(
  challenge?: CheckinPeriodChallenge | null,
  now = new Date(),
): ConsistencyPeriodSlice | null {
  const tz = challengeClockTz(challenge);
  const startRaw = challenge?.starts_at ? new Date(challenge.starts_at) : null;
  const start =
    startRaw && !Number.isNaN(startRaw.getTime()) ? startRaw : null;

  if (!start) {
    const key = normalizePeriodKey(dateStampInZone(now, tz));
    if (!key) {
      return null;
    }
    return {
      periodKey: key,
      startsAt: zonedWallTime(key, 0, 0, 0, 0, tz),
      endsAt: zonedWallTime(addYmd(key, 1), 0, 0, 0, 0, tz),
    };
  }

  if (startsAtLocalMidnight(start, tz)) {
    const startKey = normalizePeriodKey(dateStampInZone(start, tz));
    const nowKey = normalizePeriodKey(dateStampInZone(now, tz));
    const key = nowKey < startKey ? startKey : nowKey;
    const startsAt = zonedDateTimeToUtc(
      Number(key.slice(0, 4)),
      Number(key.slice(5, 7)),
      Number(key.slice(8, 10)),
      0,
      0,
      tz,
    );
    const next = addYmd(key, 1);
    const endsAt = zonedDateTimeToUtc(
      Number(next.slice(0, 4)),
      Number(next.slice(5, 7)),
      Number(next.slice(8, 10)),
      0,
      0,
      tz,
    );
    return { periodKey: key, startsAt, endsAt };
  }

  const elapsed = now.getTime() - start.getTime();
  const n = Math.max(0, Math.floor(elapsed / DAY_MS));
  const startsAt = new Date(start.getTime() + n * DAY_MS);
  const endsAt = new Date(startsAt.getTime() + DAY_MS);
  return {
    periodKey: normalizePeriodKey(dateStampInZone(startsAt, tz)),
    startsAt,
    endsAt,
  };
}

/**
 * Current `period_key` — same rule as `public.checkin_period_for`.
 * Official series: open Chicago window date, else America/Chicago day.
 * User-created: challenge tz from `starts_at` (calendar midnight or 24h slices).
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
  const slice = consistencyPeriodAt(challenge, now);
  if (slice) {
    return slice.periodKey;
  }
  return normalizePeriodKey(dateStampInZone(now, challengeClockTz(challenge)));
}

/** THIS period’s key, plus Official window stamps. Never UTC unless that is the clock. */
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
 * User-created daily consistency: end of THIS period in the challenge timezone.
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
  const slice = consistencyPeriodAt(challenge, now);
  if (!slice) {
    return null;
  }
  if (challenge.ends_at) {
    const challengeEnd = new Date(challenge.ends_at);
    if (!Number.isNaN(challengeEnd.getTime()) && slice.endsAt.getTime() > challengeEnd.getTime()) {
      return null;
    }
  }
  if (now.getTime() >= slice.endsAt.getTime()) {
    return null;
  }
  return { periodKey: slice.periodKey, endsAt: slice.endsAt };
}
