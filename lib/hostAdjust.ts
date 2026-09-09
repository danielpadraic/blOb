import { usesPointsBoard, usesQuantityScoring } from '@/lib/challengeExperience';
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
};

export function challengeIsOfficialLocked(challenge?: HostAdjustChallenge | null): boolean {
  if (!challenge) {
    return true;
  }
  if (challenge.is_official || isOfficialSeriesChallenge(challenge)) {
    return true;
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

export function viewerCanAdjustBoard(
  challenge?: HostAdjustChallenge | null,
  viewerId?: string | null,
  moderatorIds?: readonly string[] | null,
): boolean {
  if (!challenge || !viewerId) {
    return false;
  }
  if (challengeIsOfficialLocked(challenge) || challengeIsEndedForAdjust(challenge)) {
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
  return String(status ?? '') !== 'refunded_pre_start';
}

export function challengeTracksMissesForExcuse(challenge?: HostAdjustChallenge | null): boolean {
  return challengeShowsMissBudget(challenge);
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

/** Default Live line when the host skips a caption. Never a system_kind row. */
export function hostAdjustLiveBody(input: {
  action: HostAdjustAction;
  displayName: string;
  dayN?: number | null;
  caption?: string | null;
}): string {
  const caption = String(input.caption ?? '').trim();
  if (caption) {
    return caption;
  }
  const name = String(input.displayName ?? '').trim() || 'Someone';
  const day = Math.max(Math.trunc(Number(input.dayN) || 0), 0);
  if (input.action === 'excuse_miss') {
    return `Host excused a miss for ${name}.`;
  }
  if (input.action === 'remove_counted') {
    return day > 0 ? `Host removed Day ${day} for ${name}.` : `Host removed a counted day for ${name}.`;
  }
  return day > 0 ? `Host counted Day ${day} for ${name}.` : `Host counted a day for ${name}.`;
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

export function hostAdjustErrorMessage(message: string): string {
  const text = message.trim();
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
