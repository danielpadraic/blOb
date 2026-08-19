import { isPointsChallenge, isUnlimitedChallenge } from '@/lib/challenges';
import type { Challenge } from '@/lib/types';

type GoalChallenge = Pick<
  Challenge,
  'is_official' | 'challenge_type' | 'is_unlimited' | 'days_required' | 'target_count'
>;

export function challengeGoalLabel(
  challenge: GoalChallenge,
  extras?: { daysCompleted?: number; taskCount?: number },
): string {
  if (isPointsChallenge(challenge)) {
    return 'Score points';
  }
  if (isUnlimitedChallenge(challenge)) {
    const logs = Math.max(Number(extras?.daysCompleted) || 0, 0);
    return `${logs} log${logs === 1 ? '' : 's'}`;
  }
  if (challenge.is_official) {
    const days = Math.max(Number(challenge.days_required) || Number(challenge.target_count) || 7, 1);
    return `${days}-Day Consistency`;
  }
  const target = Math.max(Number(challenge.days_required) || Number(challenge.target_count) || 1, 1);
  const done = Math.max(Number(extras?.daysCompleted) || 0, 0);
  return `${done} of ${target} days`;
}

export function challengeGoalSubtitle(challenge: GoalChallenge): string | null {
  if (isPointsChallenge(challenge) || isUnlimitedChallenge(challenge)) {
    return null;
  }
  if (challenge.is_official) {
    return 'Don’t miss a day';
  }
  return null;
}
