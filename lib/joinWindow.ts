import { isOfficialSeriesChallenge } from '@/lib/officialSeries';

export const JOIN_CLOSED_COPY = 'Join closed.';
export const JOIN_OPEN_UNTIL_PREFIX = 'Join open until';

export const JOIN_UNTIL_PRESETS = [
  'at_start',
  'after_24h',
  'after_3d',
  'first_period',
  'custom',
] as const;

export type JoinUntilPreset = (typeof JOIN_UNTIL_PRESETS)[number];

export const DEFAULT_JOIN_UNTIL_PRESET: JoinUntilPreset = 'after_24h';

export const JOIN_UNTIL_CHIPS: { value: JoinUntilPreset; label: string }[] = [
  { value: 'at_start', label: 'At start' },
  { value: 'after_24h', label: '24 hours after start' },
  { value: 'after_3d', label: '3 days after start' },
  { value: 'first_period', label: 'First period ends' },
  { value: 'custom', label: 'Custom date/time' },
];

const JOINABLE_STATUSES = new Set([
  'open',
  'upcoming',
  'starting',
  'in_progress',
  'live',
  'filling',
  'arming',
]);

const CLOSED_STATUSES = new Set([
  'ended',
  'settled',
  'settling',
  'judging',
  'distributing',
  'cancelled',
  'cancelled_underfilled',
]);

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export function parseJoinInstant(value?: string | null): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function firstPeriodEndsAt(startsAt: Date, frequency?: string | null): Date {
  const unit = String(frequency ?? 'daily').toLowerCase();
  if (unit === 'weekly' || unit === '3x_week') {
    return new Date(startsAt.getTime() + 7 * DAY_MS);
  }
  if (unit === 'monthly') {
    return new Date(startsAt.getTime() + 30 * DAY_MS);
  }
  return new Date(startsAt.getTime() + DAY_MS);
}

export function resolveJoinUntilAt(input: {
  startsAt?: string | Date | null;
  preset?: JoinUntilPreset | string | null;
  customAt?: string | Date | null;
  frequency?: string | null;
}): Date | null {
  const start = input.startsAt instanceof Date ? input.startsAt : parseJoinInstant(input.startsAt ?? null);
  if (!start) {
    return input.customAt instanceof Date ? input.customAt : parseJoinInstant(input.customAt ?? null);
  }
  const preset = asJoinUntilPreset(input.preset);
  if (preset === 'custom') {
    const custom = input.customAt instanceof Date ? input.customAt : parseJoinInstant(input.customAt ?? null);
    return custom ?? new Date(start.getTime() + DAY_MS);
  }
  if (preset === 'at_start') {
    return start;
  }
  if (preset === 'after_3d') {
    return new Date(start.getTime() + 3 * DAY_MS);
  }
  if (preset === 'first_period') {
    return firstPeriodEndsAt(start, input.frequency);
  }
  return new Date(start.getTime() + DAY_MS);
}

export function asJoinUntilPreset(value?: string | null): JoinUntilPreset {
  return JOIN_UNTIL_PRESETS.includes(value as JoinUntilPreset)
    ? (value as JoinUntilPreset)
    : DEFAULT_JOIN_UNTIL_PRESET;
}

export function inferJoinUntilPreset(input: {
  startsAt?: string | Date | null;
  joinUntilAt?: string | Date | null;
  frequency?: string | null;
}): JoinUntilPreset {
  const start = input.startsAt instanceof Date ? input.startsAt : parseJoinInstant(input.startsAt ?? null);
  const until = input.joinUntilAt instanceof Date ? input.joinUntilAt : parseJoinInstant(input.joinUntilAt ?? null);
  if (!start || !until) {
    return DEFAULT_JOIN_UNTIL_PRESET;
  }
  const delta = until.getTime() - start.getTime();
  if (Math.abs(delta) < 60 * 1000) {
    return 'at_start';
  }
  if (Math.abs(delta - DAY_MS) < 60 * 1000) {
    return 'after_24h';
  }
  if (Math.abs(delta - 3 * DAY_MS) < 60 * 1000) {
    return 'after_3d';
  }
  if (Math.abs(until.getTime() - firstPeriodEndsAt(start, input.frequency).getTime()) < 60 * 1000) {
    return 'first_period';
  }
  return 'custom';
}

/**
 * Stored window. Null join_until_at on existing rows reads as At start
 * so live rooms do not reopen for 24 hours.
 */
export function storedJoinUntilAt(challenge: {
  join_until_at?: string | null;
  starts_at?: string | null;
}): Date | null {
  return parseJoinInstant(challenge.join_until_at) ?? parseJoinInstant(challenge.starts_at);
}

export function joinUntilLabel(at: Date | null, timeZone?: string | null): string | null {
  if (!at) {
    return null;
  }
  const options: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  };
  try {
    return new Intl.DateTimeFormat(undefined, {
      ...options,
      timeZone: timeZone || undefined,
    }).format(at);
  } catch {
    return new Intl.DateTimeFormat(undefined, options).format(at);
  }
}

export function joinOpenUntilLine(
  challenge: {
    join_until_at?: string | null;
    starts_at?: string | null;
    timezone?: string | null;
  },
  now = new Date(),
): string | null {
  const until = storedJoinUntilAt(challenge);
  if (!until || now.getTime() >= until.getTime()) {
    return null;
  }
  const when = joinUntilLabel(until, challenge.timezone);
  return when ? `${JOIN_OPEN_UNTIL_PREFIX} ${when}` : null;
}

export function joinUntilReviewLine(input: {
  startsAt?: string | Date | null;
  preset?: JoinUntilPreset | string | null;
  customAt?: string | Date | null;
  joinUntilAt?: string | Date | null;
  frequency?: string | null;
}): string {
  const preset = input.joinUntilAt
    ? inferJoinUntilPreset({
        startsAt: input.startsAt,
        joinUntilAt: input.joinUntilAt,
        frequency: input.frequency,
      })
    : asJoinUntilPreset(input.preset);
  const chip = JOIN_UNTIL_CHIPS.find((item) => item.value === preset);
  if (preset === 'custom') {
    const at =
      resolveJoinUntilAt({
        startsAt: input.startsAt,
        preset,
        customAt: input.customAt ?? input.joinUntilAt,
        frequency: input.frequency,
      });
    const when = joinUntilLabel(at);
    return when ? `People can join until ${when}.` : 'People can join until a custom date.';
  }
  if (preset === 'at_start') {
    return 'People can join until the start.';
  }
  return `People can join until ${chip?.label.toLowerCase() ?? '24 hours after start'}.`;
}

export function isUserJoinStatusOpen(status?: string | null): boolean {
  const value = String(status ?? '').toLowerCase();
  return JOINABLE_STATUSES.has(value) && !CLOSED_STATUSES.has(value);
}

export function isJoinWindowOpen(
  challenge: {
    status?: string | null;
    starts_at?: string | null;
    join_until_at?: string | null;
    is_official?: boolean | null;
    series_id?: string | null;
  },
  now = new Date(),
): boolean {
  const status = String(challenge.status ?? '').toLowerCase();
  if (CLOSED_STATUSES.has(status)) {
    return false;
  }
  if (isOfficialSeriesChallenge(challenge) || (challenge.is_official && challenge.series_id)) {
    return status === 'filling' || status === 'arming';
  }
  if (challenge.is_official && !challenge.series_id) {
    return false;
  }
  if (!isUserJoinStatusOpen(status)) {
    return false;
  }
  const until = storedJoinUntilAt(challenge);
  if (!until) {
    return status !== 'live' && status !== 'in_progress';
  }
  return now.getTime() < until.getTime();
}

/** join_challenge gate, in one place for tests and the printed summary. */
export function joinChallengeGate(challenge: {
  status?: string | null;
  starts_at?: string | null;
  join_until_at?: string | null;
  is_official?: boolean | null;
  series_id?: string | null;
  max_participants?: number | null;
  participant_count?: number | null;
  settled?: boolean;
}, now = new Date()): { ok: boolean; reason: 'ok' | 'JOIN_CLOSED' | 'ALREADY_STARTED' | 'NOT_JOINABLE' | 'LOBBY_FULL' } {
  const status = String(challenge.status ?? '').toLowerCase();
  if (challenge.settled || status === 'settled') {
    return { ok: false, reason: 'JOIN_CLOSED' };
  }
  if (isOfficialSeriesChallenge(challenge) || (challenge.is_official && challenge.series_id)) {
    if (status !== 'filling' && status !== 'arming') {
      return { ok: false, reason: 'ALREADY_STARTED' };
    }
    return { ok: true, reason: 'ok' };
  }
  if (challenge.is_official) {
    return { ok: false, reason: 'NOT_JOINABLE' };
  }
  if (!isJoinWindowOpen(challenge, now)) {
    return { ok: false, reason: 'JOIN_CLOSED' };
  }
  const max = challenge.max_participants;
  const count = challenge.participant_count;
  if (max != null && count != null && count >= max) {
    return { ok: false, reason: 'LOBBY_FULL' };
  }
  return { ok: true, reason: 'ok' };
}

/** Late consistency: a period that ended before join is not a miss. */
export function periodCountsAsMissForJoiner(input: {
  periodEndsAt?: string | Date | null;
  periodStart?: string | Date | null;
  joinedAt?: string | Date | null;
}): boolean {
  const joined = input.joinedAt instanceof Date ? input.joinedAt : parseJoinInstant(input.joinedAt ?? null);
  if (!joined) {
    return true;
  }
  const ends =
    input.periodEndsAt instanceof Date
      ? input.periodEndsAt
      : parseJoinInstant(input.periodEndsAt ?? null);
  if (ends) {
    return joined.getTime() < ends.getTime();
  }
  const start =
    input.periodStart instanceof Date
      ? input.periodStart
      : parseJoinInstant(input.periodStart ?? null);
  if (!start) {
    return true;
  }
  return joined.getTime() <= start.getTime();
}
