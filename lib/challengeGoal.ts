import {
  isFitnessOfficialChallenge,
  usesCumulativeScoring,
  usesPointsBoard,
  usesTotalCountCheckins,
} from '@/lib/challengeExperience';
import { athleteDistanceUnit, type DistanceUnit } from '@/lib/distance';
import { challengeCumulativeProgress } from '@/lib/cumulative';
import type { Challenge } from '@/lib/types';
import { challengeWindowDays } from '@/utils/format';

type GoalChallenge = Pick<
  Challenge,
  | 'is_official'
  | 'challenge_type'
  | 'is_unlimited'
  | 'days_required'
  | 'target_count'
  | 'length_value'
  | 'length_unit'
  | 'starts_at'
  | 'ends_at'
  | 'series_id'
  | 'category'
  | 'privacy_mode'
  | 'scoring_method'
  | 'scoring_config'
  | 'comparable_points_config'
  | 'frequency'
  | 'format'
  | 'cumulative_target'
  | 'cumulative_window'
>;

/** Host-saved calendar length. Prefer length_value / days_required — never invent 6. */
export function storedDurationDays(challenge: {
  days_required?: number | null;
  length_value?: number | null;
  length_unit?: string | null;
  duration_days?: number | null;
} | null | undefined): number | null {
  if (!challenge) {
    return null;
  }
  const explicit = Math.floor(Number(challenge.duration_days) || 0);
  if (explicit > 0) {
    return explicit;
  }
  const length = Math.floor(Number(challenge.length_value) || 0);
  if (length > 0) {
    const unit = String(challenge.length_unit ?? 'days').toLowerCase();
    if (unit.startsWith('week')) {
      return Math.max(length * 7, 1);
    }
    if (unit.startsWith('month')) {
      return Math.max(length * 30, 1);
    }
    return length;
  }
  const days = Math.floor(Number(challenge.days_required) || 0);
  return days > 0 ? days : null;
}

/** Calendar days the host saved. Never a check-in product or a 100 fallback. */
export function challengeDurationDays(
  challenge: {
    is_official?: boolean | null;
    is_unlimited?: boolean | null;
    days_required?: number | null;
    target_count?: number | null;
    length_value?: number | null;
    length_unit?: string | null;
    duration_days?: number | null;
    starts_at?: string | null;
    ends_at?: string | null;
  } | null | undefined,
): number {
  if (!challenge) {
    return 1;
  }
  if (challenge.is_official) {
    return Math.max(
      storedDurationDays(challenge) || Number(challenge.target_count) || 7,
      1,
    );
  }
  const saved = storedDurationDays(challenge);
  if (saved) {
    return saved;
  }
  if (challenge.starts_at && challenge.ends_at) {
    const windowDays = challengeWindowDays(challenge.starts_at, challenge.ends_at);
    if (windowDays > 0) {
      return windowDays;
    }
  }
  return 1;
}

export function challengeGoalLabel(
  challenge: GoalChallenge,
  extras?: { daysCompleted?: number; taskCount?: number; distanceMetersCompleted?: number; unit?: DistanceUnit },
): string {
  if (usesCumulativeScoring(challenge)) {
    return (
      challengeCumulativeProgress(
        challenge,
        extras?.distanceMetersCompleted ?? 0,
        extras?.unit ?? athleteDistanceUnit(),
      ) ?? 'Cumulative'
    );
  }
  if (usesPointsBoard(challenge)) {
    if (challenge.challenge_type === 'points' && challenge.scoring_method !== 'comparable_points') {
      const target = Math.max(Math.floor(Number(challenge.target_count) || 1), 1);
      return `Reach ${target} points`;
    }
    return 'Score Points';
  }
  if (usesTotalCountCheckins(challenge)) {
    const target = Math.max(Math.floor(Number(challenge.target_count) || 1), 1);
    const done = Math.max(Number(extras?.daysCompleted) || 0, 0);
    return `${done} of ${target} Check-Ins`;
  }
  if (challenge.is_unlimited) {
    const logs = Math.max(Number(extras?.daysCompleted) || 0, 0);
    return `${logs} check-in${logs === 1 ? '' : 's'}`;
  }
  if (isFitnessOfficialChallenge(challenge)) {
    const days = challengeDurationDays(challenge);
    return `${days}-Day Consistency`;
  }
  if (challenge.is_official) {
    const days = challengeDurationDays(challenge);
    return `${days}-day challenge`;
  }
  const target = challengeDurationDays(challenge);
  const done = Math.max(Number(extras?.daysCompleted) || 0, 0);
  return `${done} of ${target} days`;
}

export function challengeGoalSubtitle(challenge: GoalChallenge): string | null {
  if (usesCumulativeScoring(challenge)) {
    return challenge.cumulative_window === 'week'
      ? 'Everyone who hits the total each week splits the prize.'
      : 'Everyone who hits the total splits the prize.';
  }
  if (usesPointsBoard(challenge) || usesTotalCountCheckins(challenge) || challenge.is_unlimited) {
    return null;
  }
  if (isFitnessOfficialChallenge(challenge)) {
    return 'Don’t miss a day';
  }
  return null;
}
