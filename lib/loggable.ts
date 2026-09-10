import {
  usesCumulativeScoring,
  usesPointsBoard,
  usesQuantityScoring,
  usesTotalCountCheckins,
  type ExperienceChallenge,
} from '@/lib/challengeExperience';
import { ENDED_LOBBY_STATUSES } from '@/lib/constants';
import { normalizePeriodKey } from '@/lib/checkinPeriod';
import { hasChallengeEnded, isClosedForLogs } from '@/lib/settlement';

const MULTI_FORMATS = new Set(['points', 'distance', 'goal', 'cumulative']);
const DAILY_STAMP_FREQ = new Set(['daily', 'weekly', 'monthly', '3x_week']);
const ENDED_STATUSES = new Set<string>(ENDED_LOBBY_STATUSES);
/** Daily "run 1 mile" stays a stamp. A 128-mile race in the title is multi-submit. */
const TITLE_RACE_MILES = 10;
const TITLE_RACE_DISTANCE =
  /(?:^|[^0-9])([1-9][0-9]+(?:\.[0-9]+)?)\s*(mi|miles?|km|kilometers?|kilometres?)\b/i;

function titleTaskLooksLikeDistanceRace(challenge?: ExperienceChallenge | null): boolean {
  if (!challenge) {
    return false;
  }
  const text = `${challenge.title ?? ''} ${challenge.task ?? ''}`;
  const match = text.match(TITLE_RACE_DISTANCE);
  if (!match) {
    return false;
  }
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount < TITLE_RACE_MILES) {
    return false;
  }
  const unit = String(match[2] ?? '').toLowerCase();
  if (unit.startsWith('km') || unit.startsWith('kilo')) {
    return amount >= TITLE_RACE_MILES * 1.609;
  }
  return true;
}

export type LoggableFormatKind = 'consistency' | 'multi';

export type LoggableUser = {
  isParticipant?: boolean | null;
  isHost?: boolean | null;
  isCalloutObserver?: boolean | null;
  eliminated?: boolean | null;
};

export type LoggableOptions = {
  now?: Date;
  /** Submitted `challenge_checkins` row for the current challenge-tz period. */
  submittedThisPeriod?: boolean;
  /** `workout_submissions.submission_date` matching the current challenge-tz period. */
  loggedThisPeriod?: boolean;
};

/**
 * How Check In decides one-per-period vs multi-submit.
 *
 * Fields, in order:
 * - `format` / `challenge_type`: `points` | `distance` | `goal` | `cumulative` → multi
 * - `cumulative_target` / `cumulative_metric` / `metrics[].target` via quantity scoring → multi
 * - `scoring_method` / `comparable_points_config` (points board) → multi
 * - `frequency` `once`/`custom` + `target_count` (total-count) → multi
 * - `format` `consistency`/`lms`, or `frequency` daily/weekly/monthly/`3x_week` → one per period
 */
export function loggableFormatKind(challenge?: ExperienceChallenge | null): LoggableFormatKind {
  return allowsMultiCheckin(challenge) ? 'multi' : 'consistency';
}

/** Cumulative / points / distance / goal races — each Send is a new proof while live. */
export function allowsMultiCheckin(challenge?: ExperienceChallenge | null): boolean {
  if (!challenge) {
    return false;
  }
  const format = String(challenge.format ?? '').toLowerCase();
  const type = String(challenge.challenge_type ?? '').toLowerCase();
  if (MULTI_FORMATS.has(format) || MULTI_FORMATS.has(type)) {
    return true;
  }
  if (usesQuantityScoring(challenge) || usesPointsBoard(challenge) || usesCumulativeScoring(challenge)) {
    return true;
  }
  if (titleTaskLooksLikeDistanceRace(challenge)) {
    return true;
  }
  return usesTotalCountCheckins(challenge);
}

/** Daily stamp / 30-Day: one submitted check-in in the current challenge-tz period. */
export function usesPeriodCheckinGate(challenge?: ExperienceChallenge | null): boolean {
  if (!challenge) {
    return true;
  }
  if (allowsMultiCheckin(challenge)) {
    return false;
  }
  const format = String(challenge.format ?? '').toLowerCase();
  const freq = String(challenge.frequency ?? '').toLowerCase();
  if (format === 'consistency' || format === 'lms') {
    return true;
  }
  if (DAILY_STAMP_FREQ.has(freq)) {
    return true;
  }
  return true;
}

export function canCheckInOnChallenge(input: {
  isParticipant?: boolean | null;
  isCalloutObserver?: boolean | null;
}): boolean {
  return Boolean(input.isParticipant) && !input.isCalloutObserver;
}

export function asLoggableList<T extends { id?: string | null }>(
  value: T | T[] | null | undefined,
): T[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value.filter((row) => Boolean(row?.id)) : value.id ? [value] : [];
}

export function loggableStatusLine(input: {
  ends_at?: string | null;
  days_required?: number | null;
  daysCompleted?: number | null;
  todayKey?: string | null;
}): string | undefined {
  const target = Math.max(0, Number(input.days_required) || 0);
  const completed = Math.max(0, Number(input.daysCompleted) || 0);
  const endKey = input.ends_at ? normalizePeriodKey(input.ends_at) : '';
  if (endKey && input.todayKey && endKey === input.todayKey) {
    return 'Due today';
  }
  if (target > 0) {
    const day = Math.min(Math.max(completed + 1, 1), target);
    return `Day ${day} of ${target}`;
  }
  return undefined;
}

export function isLoggable(
  challenge: ExperienceChallenge & {
    status?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
    is_unlimited?: boolean | null;
    length_unit?: string | null;
    duration_days?: number | null;
  },
  user: LoggableUser,
  opts?: LoggableOptions,
): boolean {
  if (
    !canCheckInOnChallenge({
      isParticipant: Boolean(user.isParticipant || user.isHost),
      isCalloutObserver: user.isCalloutObserver,
    })
  ) {
    return false;
  }
  if (user.eliminated) {
    return false;
  }

  const now = opts?.now ?? new Date();
  const status = String(challenge.status ?? '');
  if (ENDED_STATUSES.has(status)) {
    return false;
  }

  const starts = challenge.starts_at ? new Date(challenge.starts_at).getTime() : 0;
  if (Number.isFinite(starts) && starts > now.getTime()) {
    return false;
  }

  const live = status === 'live';
  const startedStatus =
    live || status === 'in_progress' || status === 'open' || status === 'starting' || status === 'filling';
  if (!startedStatus) {
    return false;
  }
  if (live && isClosedForLogs({ ...challenge, eliminated: user.eliminated })) {
    return false;
  }
  if (!live && hasChallengeEnded(challenge, now)) {
    return false;
  }

  if (usesPeriodCheckinGate(challenge) && (opts?.submittedThisPeriod || opts?.loggedThisPeriod)) {
    return false;
  }

  return true;
}
