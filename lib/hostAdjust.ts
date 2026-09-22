import { usesPointsBoard, usesQuantityScoring } from '@/lib/challengeExperience';
import { hostRigorOf } from '@/lib/hostRigor';
import { challengeShowsMissBudget } from '@/lib/missDuty';
import { isOfficialSeriesChallenge } from '@/lib/officialSeries';

export const HOST_ADJUST_HONOR_SOURCE = {
  proof_parts: { honor: { method: 'honor' } },
  proof_kind: 'honor',
} as const;

export type HostAdjustAction = 'count_honor' | 'excuse_miss' | 'remove_counted';

export type HostAdjustDay = {
  day_n: number;
  period_key: string;
  period_start: string;
  honor?: boolean;
};

export type HostAdjustDays = {
  ok: boolean;
  display_name: string;
  misses_used: number;
  misses_allowed: number;
  missed: HostAdjustDay[];
  counted: HostAdjustDay[];
};

export type HostAdjustResult = {
  ok: boolean;
  action: HostAdjustAction;
  user_id: string;
  display_name: string;
  status: string;
  days_completed: number;
  misses_used: number;
  period_key: string | null;
  day_n: number | null;
};

const ENDED = new Set([
  'ended',
  'settled',
  'settling',
  'judging',
  'distributing',
  'cancelled',
  'cancelled_underfilled',
]);

export type HostAdjustChallenge = {
  created_by?: string | null;
  is_official?: boolean | null;
  series_id?: string | null;
  host_budget?: number | null;
  status?: string | null;
  privacy_mode?: string | null;
  challenge_type?: string | null;
  format?: string | null;
  scoring_method?: string | null;
  comparable_points_config?: unknown;
  metrics?: unknown;
  cumulative_target?: number | string | null;
  cumulative_metric?: string | null;
  frequency?: string | null;
  misses_allowed?: number | null;
  host_rigor?: string | null;
};

export function challengeIsOfficialLocked(challenge?: HostAdjustChallenge | null): boolean {
  if (!challenge) {
    return true;
  }
  if (challenge.is_official || isOfficialSeriesChallenge(challenge)) {
    return true;
  }
  if (hostRigorOf(challenge) === 'friendly') {
    return false;
  }
  return Math.max(Number(challenge.host_budget) || 0, 0) > 0;
}

export function challengeIsEndedForAdjust(challenge?: HostAdjustChallenge | null): boolean {
  return ENDED.has(String(challenge?.status ?? '').toLowerCase());
}

/** Consistency-style Board only. Miles / points hide the menu. */
export function challengeUsesConsistencyAdjustBoard(challenge?: HostAdjustChallenge | null): boolean {
  if (!challenge) {
    return false;
  }
  if (usesQuantityScoring(challenge) || usesPointsBoard(challenge)) {
    return false;
  }
  return true;
}

export function viewerCanHouseRemove(
  challenge?: HostAdjustChallenge | null,
  officialOps?: boolean | null,
): boolean {
  return Boolean(officialOps && challenge && !challengeIsEndedForAdjust(challenge));
}

export function viewerCanAdjustBoard(
  challenge?: HostAdjustChallenge | null,
  viewerId?: string | null,
  moderatorIds?: readonly string[] | null,
  officialOps?: boolean | null,
): boolean {
  if (!challenge || !viewerId) {
    return false;
  }
  if (challengeIsEndedForAdjust(challenge)) {
    return false;
  }
  if (officialOps && challengeUsesConsistencyAdjustBoard(challenge)) {
    return true;
  }
  if (challengeIsOfficialLocked(challenge)) {
    return false;
  }
  if (hostRigorOf(challenge) === 'strict') {
    return false;
  }
  if (!challengeUsesConsistencyAdjustBoard(challenge)) {
    return false;
  }
  if (challenge.created_by === viewerId) {
    return true;
  }
  return Boolean(moderatorIds?.includes(viewerId));
}

export function participantCanBeAdjusted(status?: string | null): boolean {
  const value = String(status ?? '');
  return value !== 'refunded_pre_start' && value !== 'withdrawn';
}

export function challengeTracksMissesForExcuse(challenge?: HostAdjustChallenge | null): boolean {
  return challengeShowsMissBudget(challenge);
}

/** Friendly / Normal host can still excuse. Official cash and Strict stay locked. */
export function hostExcuseStillAvailable(challenge?: HostAdjustChallenge | null): boolean {
  if (!challengeTracksMissesForExcuse(challenge)) {
    return false;
  }
  if (challengeIsEndedForAdjust(challenge)) {
    return false;
  }
  if (hostRigorOf(challenge) === 'strict') {
    return false;
  }
  if (challengeIsOfficialLocked(challenge)) {
    return false;
  }
  return true;
}

function asDay(row: Record<string, unknown>): HostAdjustDay {
  return {
    day_n: Math.max(Math.trunc(Number(row.day_n) || 0), 0),
    period_key: String(row.period_key ?? ''),
    period_start: String(row.period_start ?? ''),
    honor: Boolean(row.honor),
  };
}

export function parseHostAdjustDays(value: unknown): HostAdjustDays {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const missed = Array.isArray(row.missed) ? row.missed.map((item) => asDay(item as Record<string, unknown>)) : [];
  const counted = Array.isArray(row.counted) ? row.counted.map((item) => asDay(item as Record<string, unknown>)) : [];
  return {
    ok: row.ok !== false,
    display_name: String(row.display_name ?? 'Someone'),
    misses_used: Math.max(Math.trunc(Number(row.misses_used) || 0), 0),
    misses_allowed: Math.max(Math.trunc(Number(row.misses_allowed) || 0), 0),
    missed,
    counted,
  };
}

export function hostAdjustActorName(profile?: {
  display_name?: string | null;
  username?: string | null;
} | null): string {
  return profile?.display_name?.trim() || profile?.username?.trim() || 'Host';
}

/** Courtney, Silas, and Gloria */
export function formatHostAdjustPeople(names: readonly string[]): string {
  const clean = names.map((name) => String(name ?? '').trim() || 'Someone');
  if (clean.length === 0) {
    return 'Someone';
  }
  if (clean.length === 1) {
    return clean[0]!;
  }
  if (clean.length === 2) {
    return `${clean[0]} and ${clean[1]}`;
  }
  return `${clean.slice(0, -1).join(', ')}, and ${clean[clean.length - 1]}`;
}

export type HostAdjustBulkPerson = {
  userId: string;
  displayName: string;
  openMisses: number;
  missed: HostAdjustDay[];
  counted: HostAdjustDay[];
};

export type HostAdjustBulkPlan = {
  apply: Array<{ userId: string; displayName: string; days: HostAdjustDay[] }>;
  skip: Array<{ userId: string; displayName: string; have: number }>;
  applyCount: number;
};

function emptyAdjustDay(): HostAdjustDay {
  return { day_n: 0, period_key: '', period_start: new Date().toISOString() };
}

/** Who can take this N / these days. People short of N are skipped. */
export function planHostAdjustBulk(input: {
  action: HostAdjustAction;
  people: HostAdjustBulkPerson[];
  count: number;
  days?: HostAdjustDay[] | null;
}): HostAdjustBulkPlan {
  const n = Math.max(Math.trunc(Number(input.count) || 1), 1);
  const picked = (input.days ?? []).filter((day) => day.period_start || day.period_key);
  const apply: HostAdjustBulkPlan['apply'] = [];
  const skip: HostAdjustBulkPlan['skip'] = [];
  for (const person of input.people) {
    if (input.action === 'excuse_miss') {
      if (person.openMisses >= n) {
        apply.push({
          userId: person.userId,
          displayName: person.displayName,
          days: Array.from({ length: n }, emptyAdjustDay),
        });
      } else {
        skip.push({ userId: person.userId, displayName: person.displayName, have: person.openMisses });
      }
      continue;
    }
    const pool = input.action === 'remove_counted' ? person.counted : person.missed;
    let days: HostAdjustDay[];
    if (picked.length > 0) {
      const keys = new Set(picked.map((day) => day.period_key || day.period_start));
      days = pool.filter((day) => keys.has(day.period_key) || keys.has(day.period_start));
      if (days.length >= picked.length && days.length > 0) {
        apply.push({ userId: person.userId, displayName: person.displayName, days });
      } else {
        skip.push({ userId: person.userId, displayName: person.displayName, have: pool.length });
      }
      continue;
    }
    days = pool.slice(0, n);
    if (days.length >= n) {
      apply.push({ userId: person.userId, displayName: person.displayName, days });
    } else {
      skip.push({ userId: person.userId, displayName: person.displayName, have: pool.length });
    }
  }
  return { apply, skip, applyCount: picked.length > 0 ? picked.length : n };
}

export function hostAdjustSkipLines(
  action: HostAdjustAction,
  skip: HostAdjustBulkPlan['skip'],
): string[] {
  return skip.map((row) => {
    if (action === 'excuse_miss') {
      if (row.have <= 0) {
        return `${row.displayName} has no open misses — they’ll be skipped.`;
      }
      return `${row.displayName} only has ${row.have} open ${row.have === 1 ? 'miss' : 'misses'} — they’ll be skipped.`;
    }
    if (row.have <= 0) {
      return `${row.displayName} has no days to change — they’ll be skipped.`;
    }
    return `${row.displayName} only has ${row.have} ${row.have === 1 ? 'day' : 'days'} to change — they’ll be skipped.`;
  });
}

export function hostAdjustConfirmLine(
  action: HostAdjustAction,
  count: number,
  names: readonly string[],
): string {
  const people = formatHostAdjustPeople(names);
  const n = Math.max(Math.trunc(Number(count) || 1), 1);
  if (action === 'excuse_miss') {
    return n === 1 ? `Excuse 1 miss for ${people}?` : `Excuse ${n} misses for ${people}?`;
  }
  if (action === 'remove_counted') {
    return n === 1
      ? `Remove 1 counted day for ${people}?`
      : `Remove ${n} counted days for ${people}?`;
  }
  return n === 1 ? `Count 1 missed day for ${people}?` : `Count ${n} missed days for ${people}?`;
}

export function unionHostAdjustDays(people: HostAdjustBulkPerson[], key: 'missed' | 'counted'): HostAdjustDay[] {
  const map = new Map<string, HostAdjustDay>();
  for (const person of people) {
    for (const day of person[key]) {
      const id = day.period_key || day.period_start;
      if (id && !map.has(id)) {
        map.set(id, day);
      }
    }
  }
  return [...map.values()].sort((a, b) => a.day_n - b.day_n || a.period_key.localeCompare(b.period_key));
}

/**
 * Default Live sentence, then optional caption on the same post.
 * Bulk: one person N>1, or many people, same N. Never one bubble per miss.
 */
export function hostAdjustLiveBody(input: {
  action: HostAdjustAction;
  displayName?: string;
  names?: readonly string[];
  count?: number | null;
  dayN?: number | null;
  actorName?: string | null;
  caption?: string | null;
}): string {
  const names = (input.names?.length ? [...input.names] : [input.displayName ?? 'Someone']).map(
    (name) => String(name ?? '').trim() || 'Someone',
  );
  const people = formatHostAdjustPeople(names);
  const actor = String(input.actorName ?? '').trim() || 'Host';
  const n = Math.max(Math.trunc(Number(input.count ?? 1) || 1), 1);
  const day = Math.max(Math.trunc(Number(input.dayN) || 0), 0);
  let sentence = '';
  if (input.action === 'excuse_miss') {
    sentence =
      n === 1 && names.length === 1
        ? `${actor} excused a miss for ${people}.`
        : `${actor} excused ${n} ${n === 1 ? 'miss' : 'misses'} for ${people}.`;
  } else if (input.action === 'remove_counted') {
    if (names.length === 1 && n === 1 && day > 0) {
      sentence = `${actor} removed Day ${day} for ${people}.`;
    } else if (names.length === 1 && n === 1) {
      sentence = `${actor} removed a counted day for ${people}.`;
    } else {
      sentence = `${actor} removed ${n} counted ${n === 1 ? 'day' : 'days'} for ${people}.`;
    }
  } else if (names.length === 1 && n === 1 && day > 0) {
    sentence = `${actor} counted Day ${day} for ${people}.`;
  } else if (names.length === 1 && n === 1) {
    sentence = `${actor} counted a day for ${people}.`;
  } else {
    sentence = `${actor} counted ${n} ${n === 1 ? 'day' : 'days'} for ${people}.`;
  }
  const caption = String(input.caption ?? '').trim();
  return caption ? `${sentence}\n\n${caption}` : sentence;
}

/**
 * One lobby/Live post after a Board adjust. Home off. No system_kind — that used
 * posts_system_kind_uidx and blocked a second Count in the same challenge.
 */
export function hostAdjustLivePostRow(input: {
  authorId: string;
  challengeId: string;
  content: string;
  mediaUrls?: string[];
}): Record<string, unknown> {
  return {
    author_id: input.authorId,
    challenge_id: input.challengeId,
    content: input.content,
    media_urls: (input.mediaUrls ?? []).filter(Boolean),
    audience: 'public',
    audience_user_ids: [],
    source: 'challenge',
    type: 'feed',
    hidden_from_home: true,
  };
}

export function parseHostAdjustResult(value: unknown): HostAdjustResult {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const action = String(row.action ?? '') as HostAdjustAction;
  return {
    ok: row.ok !== false,
    action: action === 'excuse_miss' || action === 'remove_counted' ? action : 'count_honor',
    user_id: String(row.user_id ?? ''),
    display_name: String(row.display_name ?? 'Someone'),
    status: String(row.status ?? ''),
    days_completed: Math.max(Math.trunc(Number(row.days_completed) || 0), 0),
    misses_used: Math.max(Math.trunc(Number(row.misses_used) || 0), 0),
    period_key: row.period_key == null ? null : String(row.period_key),
    day_n: row.day_n == null ? null : Math.max(Math.trunc(Number(row.day_n) || 0), 0),
  };
}

export function parseHostAdjustBatchResult(value: unknown): HostAdjustResult[] {
  const row = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const results = Array.isArray(row.results) ? row.results : Array.isArray(value) ? value : [];
  return results.map((item) => parseHostAdjustResult(item));
}

function hostAdjustErrorCore(text: string): string {
  const lower = text.toLowerCase();
  if (
    lower.includes('don’t have a miss') ||
    lower.includes("don't have a miss") ||
    lower.includes('55000') ||
    lower.includes('not assigned') ||
    lower.includes('indeterminate')
  ) {
    return 'They don’t have a miss to excuse.';
  }
  if (lower.includes('official')) {
    return 'This Official challenge can’t be adjusted.';
  }
  if (lower.includes('already ended')) {
    return 'This challenge has already ended.';
  }
  if (lower.includes('already counts')) {
    return 'That day already counts.';
  }
  if (lower.includes('only the host')) {
    return 'Only the host can change the Board.';
  }
  if (
    lower.includes('23505') ||
    lower.includes('duplicate key') ||
    lower.includes('posts_system_kind') ||
    lower.includes('sqlstate') ||
    lower.includes('pl/pgsql') ||
    /^\d{5}\b/.test(text)
  ) {
    return 'Couldn’t update the Board.';
  }
  if (!text) {
    return 'Couldn’t update the Board.';
  }
  return text;
}

export function hostAdjustErrorMessage(message: string): string {
  const text = message.trim();
  const named = text.match(/^([^:]{1,80}): (.+)$/);
  if (named?.[1] && named[2] && !/^\d{5}/.test(named[1].trim())) {
    return `${named[1].trim()} — ${hostAdjustErrorCore(named[2].trim())}`;
  }
  return hostAdjustErrorCore(text);
}
