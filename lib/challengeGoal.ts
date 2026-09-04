import {
  isFitnessOfficialChallenge,
  usesCumulativeScoring,
  usesPointsBoard,
  usesTotalCountCheckins,
} from '@/lib/challengeExperience';
import { athleteDistanceUnit, type DistanceUnit } from '@/lib/distance';
import { challengeCumulativeProgress } from '@/lib/cumulative';
import {
  cumulativeMetricsProgressLabel,
  filledCumulativeMetrics,
  parseMetricTotals,
  resolveCumulativeMetrics,
} from '@/lib/cumulativeMetrics';
import type { Challenge } from '@/lib/types';

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
  | 'cumulative_metric'
  | 'cumulative_window'
  | 'distance_meters_required'
  | 'title'
  | 'task'
  | 'tasks'
  | 'metrics'
  | 'scoring_config'
  | 'win_window'
>;

export function pointsGoalTarget(challenge: {
  target_count?: number | null;
  tasks?: Array<{ points?: number | null }> | null;
  title?: string | null;
}): number {
  const saved = Math.floor(Number(challenge.target_count) || 0);
  const tasks = challenge.tasks ?? [];
  const fromTasks = tasks.reduce((sum, task) => sum + Math.max(Number(task.points) || 0, 0), 0);
  // target_count of 1 on a 10-pt Prayer task is the task count, not the points goal.
  if (saved > 0 && fromTasks > 0 && saved <= tasks.length) {
    return fromTasks;
  }
  if (saved > 0) {
    return saved;
  }
  if (fromTasks > 0) {
    return fromTasks;
  }
  const title = String(challenge.title ?? '');
  const labeled = title.match(/(\d+(?:\.\d+)?)\s*(?:pts|points?)\b/i);
  if (labeled) {
    return Math.max(Math.floor(Number(labeled[1]) || 0), 0);
  }
  return 0;
}

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

type DurationChallenge = {
  is_official?: boolean | null;
  is_unlimited?: boolean | null;
  days_required?: number | null;
  target_count?: number | null;
  length_value?: number | null;
  length_unit?: string | null;
  duration_days?: number | null;
  starts_at?: string | null;
  ends_at?: string | null;
};

/**
 * Overview ring uses saved duration_days (30 stays 30) — never an ends_at window.
 * Null means the host saved no length: show no ring instead of a fake denominator.
 */
export function challengeRingDays(
  challenge: DurationChallenge | null | undefined,
): number | null {
  if (!challenge) {
    return null;
  }
  if (challenge.is_official) {
    return Math.max(
      storedDurationDays(challenge) || Number(challenge.target_count) || 7,
      1,
    );
  }
  return storedDurationDays(challenge);
}

/** Calendar days the host saved. Never a check-in product or a 100 fallback. */
export function challengeDurationDays(
  challenge: DurationChallenge | null | undefined,
): number {
  return challengeRingDays(challenge) ?? 1;
}

export function challengeGoalLabel(
  challenge: GoalChallenge,
  extras?: {
    daysCompleted?: number;
    taskCount?: number;
    distanceMetersCompleted?: number;
    pointsCompleted?: number;
    unit?: DistanceUnit;
    metricTotals?: Record<string, number> | null;
  },
): string {
  if (usesCumulativeScoring(challenge)) {
    const metrics = resolveCumulativeMetrics(challenge);
    const filled = filledCumulativeMetrics(metrics);
    if (filled.length > 0) {
      return cumulativeMetricsProgressLabel(filled, parseMetricTotals(extras?.metricTotals));
    }
    const label = challengeCumulativeProgress(
      challenge,
      extras?.distanceMetersCompleted ?? 0,
      extras?.unit ?? athleteDistanceUnit(),
    );
    if (label && !/\/\s*0(?:\.0+)?\s*(?:mi|km)\b/i.test(label)) {
      return label;
    }
    return label && Number(challenge.cumulative_target) > 0 ? label : 'Distance';
  }
  if (usesPointsBoard(challenge)) {
    if (challenge.challenge_type === 'points' && challenge.scoring_method !== 'comparable_points') {
      const target = pointsGoalTarget(challenge);
      const done = Math.max(Number(extras?.pointsCompleted) || 0, 0);
      if (target > 0) {
        return `${done} / ${target} points`;
      }
      return 'Score Points';
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
  // Overview ring uses saved duration_days (30 stays 30) — never an ends_at window.
  const target = challengeRingDays(challenge);
  const done = Math.max(Number(extras?.daysCompleted) || 0, 0);
  if (target == null) {
    return `${done} day${done === 1 ? '' : 's'}`;
  }
  return `${done} of ${target} days`;
}

export function challengeGoalSubtitle(challenge: GoalChallenge): string | null {
  if (usesCumulativeScoring(challenge)) {
    const weekly = challenge.cumulative_window === 'week' || challenge.win_window === 'week';
    return weekly
      ? 'Anyone who hits the goal each week splits the prize.'
      : 'Anyone who hits the goal splits the prize.';
  }
  if (usesPointsBoard(challenge) || usesTotalCountCheckins(challenge) || challenge.is_unlimited) {
    return null;
  }
  if (isFitnessOfficialChallenge(challenge)) {
    return 'Don’t miss a day';
  }
  return null;
}
