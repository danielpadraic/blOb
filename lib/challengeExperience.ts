import { comparablePointsFromChallenge } from '@/lib/comparablePoints';
import { isOfficialSeriesChallenge } from '@/lib/officialSeries';
import { isPrivateCorporate } from '@/lib/privacyMode';

export type ExperienceChallenge = {
  is_official?: boolean | null;
  series_id?: string | null;
  category?: string | null;
  challenge_type?: string | null;
  privacy_mode?: string | null;
  scoring_method?: string | null;
  scoring_config?: unknown;
  comparable_points_config?: unknown;
  challenge_lane?: string | null;
  format?: string | null;
  tasks?: unknown;
  frequency?: string | null;
  target_count?: number | null;
  days_required?: number | null;
  length_value?: number | null;
};

/** Advanced create/edit only — never open the Simple form for these. */
export function usesAdvancedCreateEdit(challenge?: ExperienceChallenge | null): boolean {
  if (!challenge) {
    return false;
  }
  if (usesComparablePointsScoring(challenge)) {
    return true;
  }
  if (challenge.challenge_type === 'points' || challenge.format === 'points' || challenge.format === 'lms') {
    return true;
  }
  if (challenge.challenge_lane === 'private') {
    return true;
  }
  if (Array.isArray(challenge.tasks) && challenge.tasks.length > 1) {
    return true;
  }
  return false;
}

export function usesComparablePointsScoring(
  challenge?: ExperienceChallenge | null,
): boolean {
  if (!challenge) {
    return false;
  }
  if (challenge.scoring_method === 'comparable_points') {
    return true;
  }
  return comparablePointsFromChallenge(challenge) != null;
}

export function isCorporateChallenge(challenge?: ExperienceChallenge | null): boolean {
  return isPrivateCorporate(challenge);
}

/** Official week_10 / Official fitness — not Comparable Points or Private Corporate. */
export function isFitnessOfficialChallenge(challenge?: ExperienceChallenge | null): boolean {
  if (!challenge || usesComparablePointsScoring(challenge) || isCorporateChallenge(challenge)) {
    return false;
  }
  if (challenge.series_id === 'week_10' || isOfficialSeriesChallenge(challenge)) {
    return true;
  }
  return Boolean(challenge.is_official) && String(challenge.category ?? '').toLowerCase() === 'fitness';
}

export function requiresOfficialBodyMetrics(challenge?: ExperienceChallenge | null): boolean {
  return isFitnessOfficialChallenge(challenge);
}

/**
 * Total workouts / check-ins over the whole window — not one required day.
 * Simple create “6 over the whole challenge” lands here (`once` or `custom`).
 */
export function usesTotalCountCheckins(challenge?: ExperienceChallenge | null): boolean {
  if (!challenge || usesPointsBoard(challenge) || isFitnessOfficialChallenge(challenge)) {
    return false;
  }
  const freq = String(challenge.frequency ?? '').toLowerCase();
  if (freq === 'daily' || freq === 'weekly' || freq === 'monthly' || freq === '3x_week') {
    return false;
  }
  const target = Math.floor(Number(challenge.target_count) || 0);
  if (target <= 0) {
    return false;
  }
  if (freq === 'once' || freq === 'custom') {
    return true;
  }
  const days = Math.floor(Number(challenge.days_required) || Number(challenge.length_value) || 0);
  return days > 0 && target !== days;
}

/** Day / In-Done board and “don’t miss a day” language. */
export function usesConsistencyExperience(challenge?: ExperienceChallenge | null): boolean {
  if (usesComparablePointsScoring(challenge) || isCorporateChallenge(challenge)) {
    return false;
  }
  if (challenge?.challenge_type === 'points' || challenge?.challenge_type === 'cumulative') {
    return false;
  }
  if (challenge?.format === 'cumulative') {
    return false;
  }
  if (usesTotalCountCheckins(challenge)) {
    return false;
  }
  return true;
}

/** Ranked scoreboard — Comparable Points or classic task points. */
export function usesPointsBoard(challenge?: ExperienceChallenge | null): boolean {
  return usesComparablePointsScoring(challenge) || challenge?.challenge_type === 'points';
}

export function usesCumulativeScoring(challenge?: ExperienceChallenge | null): boolean {
  return challenge?.challenge_type === 'cumulative' || challenge?.format === 'cumulative';
}
