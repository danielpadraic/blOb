/**
 * Official Coin — the two standing house rooms owned by @blob.
 * Internal kinds are coin_weekly / coin_monthly; people read the titles below.
 *
 *   coin_weekly   host room, scores the Chicago week, 100 coins
 *   coin_monthly  scoring-only room, scores the Chicago month, 1,000 coins
 * People see ONE room: "Official Fitness Challenge" (weekly host) with two Board tabs.
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

/** The one name people read for the free Official Fitness pair. */
export const OFFICIAL_FITNESS_TITLE = 'Official Fitness Challenge';

/** Board tab labels inside the Official Fitness lobby. */
export const OFFICIAL_BOARD_TABS = {
  week: 'This Week',
  month: 'This Month',
} as const;

/**
 * What people read. `official_kind` and the SQL keep the old internal words.
 * Both rooms share one public title; the weekly room hosts the lobby and Live.
 */
export const OFFICIAL_COIN_TITLE: Record<OfficialCoinKind, string> = {
  coin_weekly: OFFICIAL_FITNESS_TITLE,
  coin_monthly: OFFICIAL_FITNESS_TITLE,
};

/** Internal names that may still be sitting in `challenges.title`. */
const LEGACY_OFFICIAL_COIN_TITLES: Record<string, OfficialCoinKind> = {
  'official weekly coin': 'coin_weekly',
  'official monthly coin': 'coin_monthly',
  'weekly fitness challenge': 'coin_weekly',
  'monthly fitness challenge': 'coin_monthly',
};

/**
 * Public name for a house room, or '' for anything else.
 * Keys off `official_kind` first, then falls back to matching the old stored
 * title so a partial row that never selected `official_kind` still reads right.
 */
export function officialCoinDisplayTitle(
  row?: (OfficialCoinChallenge & { title?: string | null }) | null,
): string {
  const kind = officialCoinKind(row);
  if (kind) {
    return OFFICIAL_COIN_TITLE[kind];
  }
  const legacy = LEGACY_OFFICIAL_COIN_TITLES[String(row?.title ?? '').trim().toLowerCase()];
  return legacy ? OFFICIAL_COIN_TITLE[legacy] : '';
}

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

/** Official Coin boards only. Pinnacle TEST stays on its own board. */
export function isOfficialCoinBoardGhost(input: {
  displayName?: string | null;
  username?: string | null;
}): boolean {
  const handle = String(input.username ?? '')
    .trim()
    .toLowerCase()
    .replace(/^@/, '');
  const name = String(input.displayName ?? '')
    .trim()
    .toLowerCase();
  if (handle.startsWith('blobtest_') || name.startsWith('blobtest_')) {
    return true;
  }
  return name.startsWith('test rookie') || name.startsWith('test veteran');
}

type GhostCandidate = {
  profile?: { display_name?: string | null; username?: string | null } | null;
  display_name?: string | null;
  username?: string | null;
};

/** QA accounts among a roster or profile list. Only Official Coin rooms hide them. */
export function countOfficialCoinGhosts(rows: readonly GhostCandidate[] | null | undefined): number {
  let ghosts = 0;
  for (const row of rows ?? []) {
    if (
      isOfficialCoinBoardGhost({
        displayName: row.profile?.display_name ?? row.display_name,
        username: row.profile?.username ?? row.username,
      })
    ) {
      ghosts += 1;
    }
  }
  return ghosts;
}

/** Room size for display. participant_count counts QA accounts, so Official Coin rooms subtract them. */
export function officialCoinRoomSize(
  challenge: (OfficialCoinChallenge & { participant_count?: number | null }) | null | undefined,
  ghostCount: number,
): number {
  const total = Math.max(Math.floor(Number(challenge?.participant_count) || 0), 0);
  if (!isOfficialCoinChallenge(challenge)) {
    return total;
  }
  return Math.max(total - Math.max(Math.floor(Number(ghostCount) || 0), 0), 0);
}

/** The scoring-only room. Hidden from Home, Search, and the Check In picker. */
export function isOfficialCoinMonthly(challenge?: OfficialCoinChallenge | null): boolean {
  return officialCoinKind(challenge) === 'coin_monthly';
}

/** Drop the monthly sibling when the weekly host is present in the same list. */
export function hideOfficialCoinSibling<T extends OfficialCoinChallenge>(rows: readonly T[]): T[] {
  const hasHost = rows.some((row) => officialCoinKind(row) === 'coin_weekly');
  return rows.filter((row) => !(hasHost && isOfficialCoinMonthly(row)));
}

/** Always drop the monthly row, even without the host in the list (Search, pickers). */
export function withoutOfficialCoinMonthly<T extends OfficialCoinChallenge>(rows: readonly T[]): T[] {
  return rows.filter((row) => !isOfficialCoinMonthly(row));
}

/**
 * Opening the monthly room lands on the weekly host. The host's Live cannot hold a monthly post or
 * comment, so those deep-link ids are dropped and the Live tab opens instead.
 */
export function officialHostRedirectHref(
  hostId: string,
  params: Record<string, string | string[] | undefined>,
): string {
  const qs = new URLSearchParams();
  const first = (value: string | string[] | undefined) =>
    String((Array.isArray(value) ? value[0] : value) ?? '').trim();
  for (const key of ['returnTo', 'logged', 'funded', 'receipt', 'from', 'notice', 'invite']) {
    const value = first(params[key]);
    if (value) {
      qs.set(key, value);
    }
  }
  const tab = first(params.tab);
  const deepLinked = Boolean(first(params.postId) || first(params.commentId));
  if (deepLinked) {
    qs.set('tab', 'feed');
  } else if (tab) {
    qs.set('tab', tab);
  }
  const query = qs.toString();
  return `/challenges/${hostId.trim()}${query ? `?${query}` : ''}`;
}

/** Pretty title for a stored paired-title string, so old posts do not print two names. */
export function normalizeOfficialPairTitle(title?: string | null): string {
  const text = String(title ?? '').trim();
  return LEGACY_OFFICIAL_COIN_TITLES[text.toLowerCase()] ? OFFICIAL_FITNESS_TITLE : text;
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
 * Current Chicago window for a kind. Weekly is Sunday 12:00 a.m. through
 * Saturday, monthly is the 1st through the last day. `endKey` is exclusive.
 * The open Official week keeps the dates already stored on that room.
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
    // Sunday 12:00 a.m. Chicago through the following Saturday.
    const dow = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Sun
    startKey = addYmd(today, -dow);
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
 * Score denominator on the Official Board.
 * Weekly is this Chicago week (7). Monthly is this Chicago month.
 * A short stored `ends_at` (a Friday join that spans 6 days) is not the window.
 */
/**
 * A past Official day the person can still finish.
 * Today and any day outside this room's live window are ignored.
 */
export function officialPastDayKey(
  raw: string | null | undefined,
  challenge?: OfficialCoinChallenge | null,
  now: Date = new Date(),
): string | null {
  if (!isOfficialCoinChallenge(challenge)) {
    return null;
  }
  const key = String(raw ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
    return null;
  }
  const today = officialCoinDateStamp(now);
  const start = officialCoinDateStamp(challenge?.starts_at);
  const end = officialCoinDateStamp(challenge?.ends_at);
  if (!today || key >= today) {
    return null;
  }
  if (start && key < start) {
    return null;
  }
  if (end && key >= end) {
    return null;
  }
  return key;
}

export function officialCoinBoardDenominator(
  challenge?: OfficialCoinChallenge | null,
  now: Date = new Date(),
): number {
  const kind = officialCoinKind(challenge);
  if (!kind) {
    return 0;
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

/** The one line in the middle of the Overview hero. */
export const OFFICIAL_COIN_HERO_LINE =
  'Complete 30-Minutes of exercise each day of the challenge.';

/**
 * The block under the Overview card. Same for both rooms — the prize number
 * lives in the Board header and the hero, not in this paragraph.
 */
export const OFFICIAL_COIN_ABOUT = {
  title: 'Official blOb Challenge:',
  body:
    'Earn coins by Checking In consistently each day. ' +
    'The more consistent you are, the higher the prize.',
  proofTitle: 'Check-In Proof:',
  proofs: [
    'a Pre-Workout Selfie',
    'a Post-Workout Selfie',
    'Proof of 30-Minutes of Elevated Heart Rate',
  ],
} as const;

/**
 * MECHANICS card. One list for both rooms — only the day count moves.
 * Order matches the proofs on the challenge row: pre, post, heart rate.
 */
export const OFFICIAL_COIN_MECHANICS = {
  proofs: [
    { id: 'pre', label: 'Post a pre-workout selfie.', method: 'Photo' },
    { id: 'post', label: 'Post a post-workout selfie.', method: 'Photo' },
    {
      id: 'hr',
      label: 'Share proof of at least 30 minutes of elevated heart rate.',
      method: 'Heart rate',
    },
  ],
} as const;

/** TO FINISH. `7-Day Consistency` weekly, `30-Day Consistency` in September. */
export function officialCoinToFinishLabel(
  challenge?: OfficialCoinChallenge | null,
  now: Date = new Date(),
): string {
  const days = officialCoinWindowDays(challenge, now);
  return days > 0 ? `${days}-Day Consistency` : '';
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

export const OFFICIAL_COIN_SPLIT_LINE = 'Split by days logged when the window ends.';

const MONTH_ABBR = [
  'Jan.', 'Feb.', 'Mar.', 'Apr.', 'May.', 'Jun.',
  'Jul.', 'Aug.', 'Sep.', 'Oct.', 'Nov.', 'Dec.',
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The last Chicago day people can still log. `ends_at` is exclusive — it is the
 * next window's midnight — so the readable end date is the day before it.
 */
export function officialCoinLastDayKey(challenge?: OfficialCoinChallenge | null): string {
  const endsAt = challenge?.ends_at ? new Date(challenge.ends_at) : null;
  if (!endsAt || Number.isNaN(endsAt.getTime())) {
    return '';
  }
  return officialCoinDateStamp(new Date(endsAt.getTime() - 1));
}

/** `Sep. 30, 2026`. No clock, ever. */
export function officialCoinEndDateLabel(challenge?: OfficialCoinChallenge | null): string {
  const key = officialCoinLastDayKey(challenge);
  if (!key) {
    return '';
  }
  const [year, month, day] = key.split('-').map(Number);
  const abbr = MONTH_ABBR[Math.min(Math.max(month, 1), 12) - 1];
  return `${abbr} ${day}, ${year}`;
}

function pad2(value: number): string {
  return String(Math.max(Math.trunc(value), 0)).padStart(2, '0');
}

export type OfficialCoinClock = { line: string; urgent: boolean };

/**
 * Top-right of the Overview hero.
 * More than a day out -> `Ends Sep. 30, 2026`.
 * Inside the last day -> a ticking `Ends in HH:MM:SS`.
 * Past the window   -> `Ended Sep. 30, 2026`.
 */
export function officialCoinEndClock(
  challenge?: OfficialCoinChallenge | null,
  now: Date | number = new Date(),
): OfficialCoinClock | null {
  if (!isOfficialCoinChallenge(challenge)) {
    return null;
  }
  const label = officialCoinEndDateLabel(challenge);
  const endsAt = challenge?.ends_at ? new Date(challenge.ends_at).getTime() : NaN;
  if (!label || !Number.isFinite(endsAt)) {
    return null;
  }
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  const left = endsAt - nowMs;
  if (left <= 0) {
    return { line: `Ended ${label}`, urgent: false };
  }
  if (left > DAY_MS) {
    return { line: `Ends ${label}`, urgent: false };
  }
  const total = Math.floor(left / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return {
    line: `Ends in ${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`,
    urgent: true,
  };
}

/** Leave Official drops both rooms. Warn first. */
export const OFFICIAL_COIN_LEAVE_CONFIRM = {
  title: 'Leave Official Fitness?',
  body:
    'You’ll leave the Official Fitness Challenge, including the week and month boards. ' +
    'Its Live goes away from Home.',
  confirm: 'Leave',
  cancel: 'Stay',
} as const;

/** Slot 0 of the Home Live rail once someone has left. One tap, both rooms back. */
export const OFFICIAL_COIN_REJOIN_PILL = {
  title: 'Rejoin Official',
  subline: 'Week + Month · remaining days',
  error: 'Couldn’t rejoin. Try again.',
} as const;

/**
 * Whether slot 0 shows Rejoin. True when they opted out, or when they are not
 * on both standing rooms. False the moment both memberships are back.
 */
export function canRejoinOfficialCoin(input: {
  roomsExist?: boolean;
  optedOut?: boolean;
  weeklyJoined?: boolean;
  monthlyJoined?: boolean;
}): boolean {
  if (!input.roomsExist) {
    return false;
  }
  if (input.optedOut) {
    return true;
  }
  return !(input.weeklyJoined && input.monthlyJoined);
}

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
