import { meetsMinMinutes, workoutOverlapsPeriod } from '@/lib/health/period';
import type { HealthConfidence, HealthWorkout } from '@/services/health/types';

const CONFIDENCE_RANK: Record<HealthConfidence, number> = {
  watch: 3,
  phone: 2,
  unknown: 1,
  manual: 0,
};

export function rankHealthWorkouts(
  workouts: HealthWorkout[],
  opts: {
    period: { from: Date; to: Date };
    minMinutes?: number | null;
    usedIds?: Set<string>;
    preferStartedAfter?: Date | string | null;
  },
): HealthWorkout[] {
  const used = opts.usedIds ?? new Set<string>();
  const afterMs = opts.preferStartedAfter
    ? new Date(opts.preferStartedAfter).getTime()
    : Number.NaN;
  const inPeriod = workouts
    .filter((row) => workoutOverlapsPeriod(row, opts.period))
    .filter((row) => !used.has(row.providerWorkoutId));
  const afterStart =
    Number.isFinite(afterMs)
      ? inPeriod.filter((row) => new Date(row.startedAt).getTime() >= afterMs)
      : [];
  const pool = afterStart.length > 0 ? afterStart : inPeriod;
  return pool.sort((a, b) => {
    const aFit = meetsMinMinutes(a.durationSec, opts.minMinutes) ? 1 : 0;
    const bFit = meetsMinMinutes(b.durationSec, opts.minMinutes) ? 1 : 0;
    if (aFit !== bFit) {
      return bFit - aFit;
    }
    const aConf = CONFIDENCE_RANK[a.confidence] ?? 0;
    const bConf = CONFIDENCE_RANK[b.confidence] ?? 0;
    if (aConf !== bConf) {
      return bConf - aConf;
    }
    return a.endedAt < b.endedAt ? 1 : -1;
  });
}
