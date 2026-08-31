import { athleteDistanceUnit, formatDistance, parseDistanceText, type DistanceUnit } from '@/lib/distance';
import { usesCumulativeScoring } from '@/lib/challengeExperience';

export type CumulativeWindow = 'challenge' | 'week' | 'day';

function storedCumulativeMeters(challenge?: {
  cumulative_target?: number | null;
} | null): number {
  return Math.max(Number(challenge?.cumulative_target) || 0, 0);
}

/** Saved race target in meters. Title is last resort when the column is missing or 0. */
export function cumulativeTargetMeters(challenge?: {
  cumulative_target?: number | null;
  title?: string | null;
  task?: string | null;
} | null): number {
  const stored = storedCumulativeMeters(challenge);
  if (stored > 0) {
    return stored;
  }
  return (
    parseDistanceText(challenge?.title ?? '') ??
    parseDistanceText(challenge?.task ?? '') ??
    0
  );
}

export function rawCumulativeTargetMeters(challenge?: {
  cumulative_target?: number | null;
} | null): number {
  return storedCumulativeMeters(challenge);
}

export function cumulativeProgressCopy(
  doneMeters: number,
  targetMeters: number,
  unit: DistanceUnit = 'mi',
): string {
  const target = Math.max(targetMeters, 0);
  const done = Math.max(doneMeters, 0);
  return `${formatDistance(done, unit)} / ${formatDistance(target, unit)}`;
}

export function cumulativeEligible(
  doneMeters: number,
  targetMeters: number,
): boolean {
  const target = Math.max(targetMeters, 0);
  if (target <= 0) {
    return false;
  }
  return Math.max(doneMeters, 0) >= target;
}

export function challengeCumulativeProgress(
  challenge?: {
    challenge_type?: string | null;
    format?: string | null;
    cumulative_target?: number | null;
    title?: string | null;
    task?: string | null;
  } | null,
  doneMeters = 0,
  unit: DistanceUnit = athleteDistanceUnit(),
): string | null {
  if (!usesCumulativeScoring(challenge)) {
    return null;
  }
  return cumulativeProgressCopy(doneMeters, cumulativeTargetMeters(challenge), unit);
}
