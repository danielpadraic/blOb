import { challengeRingDays } from '@/lib/challengeGoal';
import {
  challengeClockTz,
  checkinPeriodKey,
  normalizePeriodKey,
  type CheckinPeriodChallenge,
} from '@/lib/checkinPeriod';
import { dateStampInZone } from '@/lib/officialDays';
import type { LiveThreadRow } from '@/lib/liveThread';

/** Live day breaks read the same clock as Check In: host tz, else Denver, Officials Chicago. */
export type LiveDayBreakChallenge = CheckinPeriodChallenge & {
  is_unlimited?: boolean | null;
  length_value?: number | null;
  length_unit?: string | null;
  duration_days?: number | null;
};

export type LiveDayBreak = {
  periodKey: string;
  dateLine: string;
  dayLine: string | null;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** Noon UTC anchor so a date-only key never slides a day when it is formatted. */
function anchorForKey(periodKey: string): Date | null {
  if (!YMD.test(periodKey)) {
    return null;
  }
  const at = new Date(
    Date.UTC(
      Number(periodKey.slice(0, 4)),
      Number(periodKey.slice(5, 7)) - 1,
      Number(periodKey.slice(8, 10)),
      12,
    ),
  );
  return Number.isNaN(at.getTime()) ? null : at;
}

function daysBetweenKeys(from: string, to: string): number | null {
  const left = anchorForKey(from);
  const right = anchorForKey(to);
  if (!left || !right) {
    return null;
  }
  return Math.round((right.getTime() - left.getTime()) / DAY_MS);
}

/** “Friday, September 4, 2026”. The key is already the challenge-tz day, so read it as UTC. */
export function liveDayDateLine(periodKey: string): string {
  const at = anchorForKey(periodKey);
  if (!at) {
    return '';
  }
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: 'UTC',
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(at);
  } catch {
    return periodKey;
  }
}

/**
 * Period bucket for one Live row.
 * Posts carry no period key, so created_at goes through the check-in period rule.
 * Rows older than starts_at keep their own calendar day instead of clamping onto day 1.
 */
export function livePeriodKeyAt(
  challenge: LiveDayBreakChallenge | null | undefined,
  when: string | null | undefined,
): string {
  const at = when ? new Date(when) : null;
  if (!at || Number.isNaN(at.getTime())) {
    return '';
  }
  try {
    const startRaw = challenge?.starts_at ? new Date(challenge.starts_at) : null;
    const start = startRaw && !Number.isNaN(startRaw.getTime()) ? startRaw : null;
    if (start && at.getTime() < start.getTime()) {
      return normalizePeriodKey(dateStampInZone(at, challengeClockTz(challenge ?? null)));
    }
    return normalizePeriodKey(checkinPeriodKey(challenge ?? null, at));
  } catch {
    return '';
  }
}

/** `Day N / X` from starts_at and saved duration. Null rather than an invented denominator. */
export function liveDayLine(
  challenge: LiveDayBreakChallenge | null | undefined,
  periodKey: string,
): string | null {
  const total = challengeRingDays(challenge);
  if (!total || total < 1) {
    return null;
  }
  const startKey = livePeriodKeyAt(challenge, challenge?.starts_at);
  if (!startKey) {
    return null;
  }
  const diff = daysBetweenKeys(startKey, periodKey);
  if (diff == null) {
    return null;
  }
  const day = diff + 1;
  if (day < 1 || day > total) {
    return null;
  }
  return `Day ${day} / ${total}`;
}

export function liveDayBreakFor(
  challenge: LiveDayBreakChallenge | null | undefined,
  periodKey: string,
): LiveDayBreak | null {
  const dateLine = liveDayDateLine(periodKey);
  if (!dateLine) {
    return null;
  }
  return { periodKey, dateLine, dayLine: liveDayLine(challenge, periodKey) };
}

/**
 * Period math builds Intl formatters, and the thread rebuilds on every reaction.
 * Keyed on the challenge object, so new query data is a new cache.
 */
const PERIOD_KEYS = new WeakMap<object, Map<string, string>>();
const PERIOD_CACHE_MAX = 4000;

function cachedPeriodKeyAt(challenge: LiveDayBreakChallenge, when: string): string {
  let byTime = PERIOD_KEYS.get(challenge);
  if (!byTime) {
    byTime = new Map();
    PERIOD_KEYS.set(challenge, byTime);
  }
  const hit = byTime.get(when);
  if (hit !== undefined) {
    return hit;
  }
  const periodKey = livePeriodKeyAt(challenge, when);
  if (byTime.size < PERIOD_CACHE_MAX) {
    byTime.set(when, periodKey);
  }
  return periodKey;
}

/** One break above the first row of each period day. Same day = no new break. */
export function insertLiveDayBreaks(
  rows: LiveThreadRow[],
  challenge: LiveDayBreakChallenge | null | undefined,
): LiveThreadRow[] {
  if (!challenge) {
    return rows;
  }
  const out: LiveThreadRow[] = [];
  let seen = '';
  for (const row of rows) {
    const periodKey = cachedPeriodKeyAt(challenge, row.createdAt);
    if (periodKey && periodKey !== seen) {
      seen = periodKey;
      const day = liveDayBreakFor(challenge, periodKey);
      if (day) {
        out.push({
          id: `day:${periodKey}`,
          createdAt: row.createdAt,
          kind: 'day',
          ...day,
        });
      }
    }
    out.push(row);
  }
  return out;
}
