import {
  isFitnessOfficialChallenge,
  usesComparablePointsScoring,
} from '@/lib/challengeExperience';
import { isPointsChallenge, isUnlimitedChallenge } from '@/lib/challenges';
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
>;

/** Calendar days the host saved. Never a check-in product or a 100 fallback. */
export function challengeDurationDays(
  challenge: {
    is_official?: boolean | null;
    is_unlimited?: boolean | null;
    days_required?: number | null;
    target_count?: number | null;
    length_value?: number | null;
    length_unit?: string | null;
    starts_at?: string | null;
    ends_at?: string | null;
  } | null | undefined,
): number {
  if (!challenge) {
    return 1;
  }
  if (challenge.is_official) {
    return Math.max(Number(challenge.days_required) || Number(challenge.target_count) || 7, 1);
  }
  const stored = Math.floor(Number(challenge.length_value) || 0);
  if (stored > 0) {
    const unit = String(challenge.length_unit ?? 'days').toLowerCase();
    if (unit.startsWith('week')) {
      return Math.max(stored * 7, 1);
    }
    if (unit.startsWith('month')) {
      return Math.max(stored * 30, 1);
    }
    return stored;
  }
  if (challenge.starts_at && challenge.ends_at) {
    const windowDays = challengeWindowDays(challenge.starts_at, challenge.ends_at);
    if (windowDays > 0) {
      return windowDays;
    }
  }
  return Math.max(Math.floor(Number(challenge.days_required) || 1), 1);
}

export function challengeGoalLabel(
  challenge: GoalChallenge,
  extras?: { daysCompleted?: number; taskCount?: number },
): string {
  if (usesComparablePointsScoring(challenge)) {
    return 'Comparable Points';
  }
  if (isPointsChallenge(challenge)) {
    return 'Score points';
  }
  if (isUnlimitedChallenge(challenge)) {
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
  if (usesComparablePointsScoring(challenge) || isPointsChallenge(challenge) || isUnlimitedChallenge(challenge)) {
    return null;
  }
  if (isFitnessOfficialChallenge(challenge)) {
    return 'Don’t miss a day';
  }
  return null;
}
