import type { HealthWorkout } from '@/services/health/types';

/**
 * Recent HealthKit workouts worth offering after Complete.
 *
 * Same calendar day as the session. Duration overlap with the session window is preferred, so a
 * 45-minute strength workout beats a 5-minute walk that happened to land on the same date.
 */

export function sameCalendarDay(iso: string, day: Date): boolean {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return false;
  }
  return (
    date.getFullYear() === day.getFullYear() &&
    date.getMonth() === day.getMonth() &&
    date.getDate() === day.getDate()
  );
}

export function overlapSeconds(
  aStart: string,
  aEnd: string,
  bStartMs: number,
  bEndMs: number,
): number {
  const start = Math.max(Date.parse(aStart), bStartMs);
  const end = Math.min(Date.parse(aEnd), bEndMs);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return 0;
  }
  return Math.round((end - start) / 1000);
}

export function rankHealthKitWorkouts(
  workouts: readonly HealthWorkout[],
  performedAt: string,
  durationSeconds: number,
): HealthWorkout[] {
  const day = new Date(performedAt);
  if (Number.isNaN(day.getTime())) {
    return [];
  }
  const windowStart = day.getTime();
  const windowEnd = windowStart + Math.max(durationSeconds, 30 * 60) * 1000;
  return workouts
    .filter((workout) => sameCalendarDay(workout.startedAt, day) || sameCalendarDay(workout.endedAt, day))
    .slice()
    .sort((a, b) => {
      const overlapA = overlapSeconds(a.startedAt, a.endedAt, windowStart, windowEnd);
      const overlapB = overlapSeconds(b.startedAt, b.endedAt, windowStart, windowEnd);
      if (overlapA !== overlapB) {
        return overlapB - overlapA;
      }
      return Date.parse(b.startedAt) - Date.parse(a.startedAt);
    });
}
