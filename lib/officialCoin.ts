/**
 * Official Coin — the two standing house rooms owned by @blob.
 *
 *   Official Weekly Coin   Mon 00:00 -> Sun end, America/Chicago,   100 coin guarantee
 *   Official Monthly Coin  1st 00:00 -> last day end, America/Chicago, 1,000 coin guarantee
 *
 * The same challenge row rolls to the next window, so nothing here may assume a
 * fresh id per week. Scoring is count-days, never knockout: no Remaining, no
 * Caught Up, no Dropped, no start gate.
 *
 * Mirrors `public.official_coin_*` in SQL. Windows are Chicago calendar dates.
 */
import { dateStampInZone, zonedWallTime } from '@/lib/officialDays';

export const OFFICIAL_COIN_TZ = 'America/Chicago';

export type OfficialCoinKind = 'coin_weekly' | 'coin_monthly';

export const OFFICIAL_COIN_KINDS: readonly OfficialCoinKind[] = ['coin_weekly', 'coin_monthly'];

export const OFFICIAL_COIN_GUARANTEE: Record<OfficialCoinKind, number> = {
  coin_weekly: 100,
  coin_monthly: 1000,
};

export const OFFICIAL_COIN_TITLE: Record<OfficialCoinKind, string> = {
  coin_weekly: 'Official Weekly Coin',
  coin_monthly: 'Official Monthly Coin',
};

/** House chrome on the Check In picker. Different from private / user challenges. */
export const OFFICIAL_COIN_CHECKIN_LABEL = 'Official Check-In';
export const OFFICIAL_COIN_SPONSOR_LINE = 'Sponsored by blOb';
export const OFFICIAL_COIN_ALREADY_TODAY = 'You’re in for today.';

export type OfficialCoinChallenge = {
  id?: string | null;
  title?: string | null;
  official_kind?: string | null;
  window_reset?: string | null;
  score_mode?: string | null;
  prize_guarantee_coins?: number | null;
  days_required?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
};

export type OfficialCoinMembership = {
  challenge_id?: string | null;
  window_starts_at?: string | null;
  window_ends_at?: string | null;
  room_id?: string | null;
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function addYmd(ymd: string, days: number): string {
  const [year, month, day] = ymd.split('-').map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day + days));
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
}

function daysBetweenYmd(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) {
    return 0;
  }
  return Math.round((b - a) / 86_400_000);
}

/** Chicago calendar date for an instant. Matches `(timezone('America/Chicago', ts))::date`. */
export function officialCoinDateStamp(at: Date | string | null | undefined): string {
  const date = at instanceof Date ? at : at ? new Date(at) : new Date();
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return dateStampInZone(date, OFFICIAL_COIN_TZ);
}

export function officialCoinKind(
  challenge?: OfficialCoinChallenge | null,
): OfficialCoinKind | null {
  const kind = String(challenge?.official_kind ?? '').trim();
  return kind === 'coin_weekly' || kind === 'coin_monthly' ? kind : null;
}

export function isOfficialCoinChallenge(challenge?: OfficialCoinChallenge | null): boolean {
  return officialCoinKind(challenge) != null;
}

export function isOfficialCoinWeekly(challenge?: OfficialCoinChallenge | null): boolean {
  return officialCoinKind(challenge) === 'coin_weekly';
}

/** 100 / 1,000. Falls back to the column so @blob can retune without a ship. */
export function officialCoinGuarantee(challenge?: OfficialCoinChallenge | null): number {
  const kind = officialCoinKind(challenge);
  if (!kind) {
    return 0;
  }
  const stored = Number(challenge?.prize_guarantee_coins);
  if (Number.isFinite(stored) && stored > 0) {
    return Math.trunc(stored);
  }
  return OFFICIAL_COIN_GUARANTEE[kind];
}

export function formatOfficialCoinAmount(coins: number): string {
  const value = Math.max(Math.trunc(Number(coins) || 0), 0);
  return value.toLocaleString('en-US');
}

/**
 * Current Chicago window for a kind. Weekly is Monday through Sunday,
 * monthly is the 1st through the last day. `endKey` is exclusive.
 */
export function officialCoinWindowBounds(
  kind: OfficialCoinKind,
  now: Date = new Date(),
): { startKey: string; endKey: string; days: number; startsAt: Date; endsAt: Date } {
  const today = dateStampInZone(now, OFFICIAL_COIN_TZ);
  const [year, month, day] = today.split('-').map(Number);
  let startKey: string;
  let endKey: string;
  if (kind === 'coin_monthly') {
    startKey = `${year}-${pad(month)}-01`;
    endKey =
      month === 12 ? `${year + 1}-01-01` : `${year}-${pad(month + 1)}-01`;
  } else {
    // Monday-first, matching Postgres date_trunc('week').
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun
    const backToMonday = dow === 0 ? 6 : dow - 1;
    startKey = addYmd(today, -backToMonday);
    endKey = addYmd(startKey, 7);
  }
  return {
    startKey,
    endKey,
    days: daysBetweenYmd(startKey, endKey),
    startsAt: zonedWallTime(startKey, 0, 0, 0, 0, OFFICIAL_COIN_TZ),
    endsAt: zonedWallTime(endKey, 0, 0, 0, 0, OFFICIAL_COIN_TZ),
  };
}

/** Days in this room's window. 7, or 28-31. */
export function officialCoinWindowDays(
  challenge?: OfficialCoinChallenge | null,
  now: Date = new Date(),
): number {
  const kind = officialCoinKind(challenge);
  if (!kind) {
    return 0;
  }
  const startKey = officialCoinDateStamp(challenge?.starts_at);
  const endKey = officialCoinDateStamp(challenge?.ends_at);
  if (startKey && endKey) {
    const span = daysBetweenYmd(startKey, endKey);
    if (span > 0) {
      return span;
    }
  }
  const stored = Number(challenge?.days_required);
  if (Number.isFinite(stored) && stored > 0) {
    return Math.trunc(stored);
  }
  return officialCoinWindowBounds(kind, now).days;
}

/**
 * Days this person may still fill. Mid-window join counts only the remaining
 * Chicago calendar days — a Thursday join is 4 of 7 that week, never 7 of 7.
 */
export function officialCoinAllowedDays(
  challenge?: OfficialCoinChallenge | null,
  membership?: OfficialCoinMembership | null,
  now: Date = new Date(),
): number {
  if (!isOfficialCoinChallenge(challenge)) {
    return 0;
  }
  const windowDays = officialCoinWindowDays(challenge, now);
  const endKey = officialCoinDateStamp(challenge?.ends_at);
  const windowStartKey = officialCoinDateStamp(challenge?.starts_at);
  const joinedKey = membership?.window_starts_at
    ? officialCoinDateStamp(membership.window_starts_at)
    : '';
  if (!endKey || !joinedKey || !windowStartKey) {
    return windowDays;
  }
  const fromKey = joinedKey > windowStartKey ? joinedKey : windowStartKey;
  return Math.max(Math.min(daysBetweenYmd(fromKey, endKey), windowDays), 0);
}

/** Chicago days left in the window, counting today. */
export function officialCoinDaysLeft(
  challenge?: OfficialCoinChallenge | null,
  now: Date = new Date(),
): number {
  const endKey = officialCoinDateStamp(challenge?.ends_at);
  const todayKey = dateStampInZone(now, OFFICIAL_COIN_TZ);
  if (!endKey || !todayKey) {
    return 0;
  }
  return Math.max(daysBetweenYmd(todayKey, endKey), 0);
}

/** `3 of 7`. Never a knockout tag. */
export function officialCoinScoreLabel(days: number, allowed: number): string {
  const logged = Math.max(Math.trunc(Number(days) || 0), 0);
  const max = Math.max(Math.trunc(Number(allowed) || 0), 0);
  return max > 0 ? `${logged} of ${max}` : String(logged);
}

/** Board header. A kind fact — no Remaining / Caught Up / Dropped. */
export function officialCoinBoardHeaderLine(
  challenge?: OfficialCoinChallenge | null,
  now: Date = new Date(),
): string {
  const kind = officialCoinKind(challenge);
  if (!kind) {
    return '';
  }
  const prize = `Prize ${formatOfficialCoinAmount(officialCoinGuarantee(challenge))} coins`;
  const left = officialCoinDaysLeft(challenge, now);
  const unit = kind === 'coin_weekly' ? 'this week' : 'this month';
  if (left <= 0) {
    return `${prize} · Window closed`;
  }
  return `${prize} · ${left} ${left === 1 ? 'day' : 'days'} left ${unit}`;
}

/** Overview RULES. Plain paragraph, exactly as locked. */
export function officialCoinRulesParagraph(challenge?: OfficialCoinChallenge | null): string {
  const kind = officialCoinKind(challenge);
  if (!kind) {
    return '';
  }
  const prize = formatOfficialCoinAmount(officialCoinGuarantee(challenge));
  if (kind === 'coin_weekly') {
    return (
      `Log a workout each Chicago day this week. When Sunday ends, ${prize} coins ` +
      'split by days logged. Joining mid-week means you can only log the days left. ' +
      'Misses do not drop you.'
    );
  }
  return (
    `Log a workout each Chicago day this month. When the month ends, ${prize} coins ` +
    'split by days logged. Joining mid-month means you can only log the days left. ' +
    'Misses do not drop you.'
  );
}

/** Shown when the roster row started mid-window. */
export function officialCoinMidWindowLine(
  challenge?: OfficialCoinChallenge | null,
  membership?: OfficialCoinMembership | null,
  now: Date = new Date(),
): string {
  const kind = officialCoinKind(challenge);
  if (!kind) {
    return '';
  }
  const allowed = officialCoinAllowedDays(challenge, membership, now);
  const full = officialCoinWindowDays(challenge, now);
  if (allowed <= 0 || allowed >= full) {
    return '';
  }
  const unit = kind === 'coin_weekly' ? 'week' : 'month';
  return `You joined mid-${unit}, so ${allowed} of ${full} days are still open to you.`;
}

export function officialCoinPrizeLine(challenge?: OfficialCoinChallenge | null): string {
  const kind = officialCoinKind(challenge);
  if (!kind) {
    return '';
  }
  return `${formatOfficialCoinAmount(officialCoinGuarantee(challenge))} coins, guaranteed by blOb.`;
}

export const OFFICIAL_COIN_SPLIT_LINE = 'Split by days logged when the window ends.';

/** Leave Official drops both rooms. Warn first. */
export const OFFICIAL_COIN_LEAVE_CONFIRM = {
  title: 'Leave Official Coin?',
  body:
    'You’ll leave the Weekly and Monthly Official rooms. ' +
    'Home Live from those rooms goes away.',
  confirm: 'Leave',
  cancel: 'Stay',
} as const;

/** Sort the Check In picker: Official Check-In first, weekly ahead of monthly. */
export function officialCoinPickerRank(challenge?: OfficialCoinChallenge | null): number {
  const kind = officialCoinKind(challenge);
  if (kind === 'coin_weekly') {
    return 0;
  }
  if (kind === 'coin_monthly') {
    return 1;
  }
  return 2;
}

export function sortOfficialCoinFirst<T extends OfficialCoinChallenge>(rows: T[]): T[] {
  return [...rows].sort((a, b) => officialCoinPickerRank(a) - officialCoinPickerRank(b));
}

/** Both room ids, weekly first. Empty entries are dropped. */
export function officialCoinRoomIds<T extends OfficialCoinChallenge>(rows: T[]): string[] {
  const byKind = new Map<OfficialCoinKind, string>();
  for (const row of rows) {
    const kind = officialCoinKind(row);
    const id = String(row?.id ?? '').trim();
    if (kind && id && !byKind.has(kind)) {
      byKind.set(kind, id);
    }
  }
  return OFFICIAL_COIN_KINDS.map((kind) => byKind.get(kind) ?? '').filter(Boolean);
}
