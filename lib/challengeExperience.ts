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

/** Day / In-Done board and “don’t miss a day” language. */
export function usesConsistencyExperience(challenge?: ExperienceChallenge | null): boolean {
  if (usesComparablePointsScoring(challenge) || isCorporateChallenge(challenge)) {
    return false;
  }
  if (challenge?.challenge_type === 'points') {
    return false;
  }
  return true;
}

/** Ranked scoreboard — Comparable Points or classic task points. */
export function usesPointsBoard(challenge?: ExperienceChallenge | null): boolean {
  return usesComparablePointsScoring(challenge) || challenge?.challenge_type === 'points';
}
