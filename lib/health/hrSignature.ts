import { usableBpm } from '@/lib/health/hrSeries';
import type { HealthHeartRateSample } from '@/services/health/types';

/**
 * What a heart looks like doing a given kind of work.
 *
 * The threat is a person handing their own watch to someone else to finish a workout for them: the
 * account, the device and the workout are all genuinely theirs, so provenance cannot see it. The only
 * witness is the trace, because two bodies doing identical work produce visibly different traces —
 * on the walk Daniel and Courtney took together, same activity and same 143 minutes, they averaged
 * 103 and 120 and peaked at 112 and 136.
 *
 * These numbers are never a verdict on their own. One person's own average across strength sessions
 * ran 98 to 130 in a single week, so a lone session says only how hard someone went. They are a
 * baseline: worth something once an account has a history in the same activity, and worth nothing
 * before that. The comparison lives in SQL against the account's own prior sessions.
 */
export type HrSignature = {
  /** Readings behind these numbers. Few readings make every figure below softer. */
  points: number;
  mean: number;
  /** 95th percentile rather than the raw maximum, which one sensor spike can own. */
  peak: number;
  /** 5th percentile: how low this heart settles while still working. */
  floor: number;
  /** Spread of the trace — steady effort versus intervals. */
  sd: number;
  /** How fast the rate climbs as work starts, in BPM per minute. */
  onsetBpmPerMin: number | null;
  /**
   * How fast the rate falls as work stops, in BPM per minute, negative for a heart coming down.
   * The most personal of these: recovery tracks vagal tone, and it is not something a substitute can
   * match by choosing to go easier or harder.
   */
  recoveryBpmPerMin: number | null;
};

/** Below this there is not enough trace to say anything, and a guess here accuses someone. */
const MIN_POINTS = 8;
const MIN_DURATION_SEC = 300;

/** Minutes at each end of the workout that the slopes are measured over. */
const ONSET_WINDOW_MIN = 3;
const RECOVERY_WINDOW_MIN = 2;
const MIN_SLOPE_POINTS = 3;

type Reading = { min: number; bpm: number };

function percentile(sorted: number[], fraction: number): number {
  const at = Math.round(fraction * (sorted.length - 1));
  return sorted[Math.min(Math.max(at, 0), sorted.length - 1)];
}

function mean(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function stdDev(values: number[]): number {
  if (values.length < 2) {
    return 0;
  }
  const center = mean(values);
  const variance = values.reduce((total, value) => total + (value - center) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Least-squares slope in BPM per minute, or null when the window is too thin to fit a line.
 *
 * A fit rather than last-minus-first: a single noisy reading at either edge of the window would
 * otherwise set the whole slope.
 */
function slope(readings: Reading[]): number | null {
  if (readings.length < MIN_SLOPE_POINTS) {
    return null;
  }
  const minutes = readings.map((entry) => entry.min);
  const bpms = readings.map((entry) => entry.bpm);
  const centerMin = mean(minutes);
  const centerBpm = mean(bpms);
  let top = 0;
  let bottom = 0;
  for (let index = 0; index < readings.length; index += 1) {
    const spread = minutes[index] - centerMin;
    top += spread * (bpms[index] - centerBpm);
    bottom += spread * spread;
  }
  if (bottom === 0) {
    return null;
  }
  return top / bottom;
}

function round(value: number, places = 1): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/**
 * Readings placed on a minute axis.
 *
 * Live samples carry their own times. A stored series does not — timestamps are deliberately dropped
 * before a trace is saved, because a workout's sample times are the closest thing in a snapshot to a
 * location trail — so its readings are spread evenly across the workout instead. That is exact enough
 * for the shape of the whole trace and too coarse for the slopes at its ends, which is why a
 * backfilled session usually reports no slopes rather than invented ones.
 */
function readingsFrom(input: {
  samples?: HealthHeartRateSample[] | null;
  series?: number[] | null;
  durationSec: number;
}): Reading[] {
  const samples = Array.isArray(input.samples) ? input.samples : [];
  const timed: Reading[] = [];
  for (const sample of samples) {
    const bpm = usableBpm(sample?.bpm);
    const at = Date.parse(String(sample?.at));
    if (bpm != null && Number.isFinite(at)) {
      timed.push({ min: at / 60000, bpm });
    }
  }
  if (timed.length >= MIN_POINTS) {
    timed.sort((left, right) => left.min - right.min);
    const first = timed[0].min;
    return timed.map((entry) => ({ min: entry.min - first, bpm: entry.bpm }));
  }

  const series: number[] = [];
  for (const entry of Array.isArray(input.series) ? input.series : []) {
    const bpm = usableBpm(entry);
    if (bpm != null) {
      series.push(bpm);
    }
  }
  if (series.length < MIN_POINTS) {
    return [];
  }
  const span = input.durationSec / 60;
  return series.map((bpm, index) => ({
    min: (index / (series.length - 1)) * span,
    bpm,
  }));
}

/**
 * The signature for one workout, or null when the trace cannot support one.
 *
 * Null is the common and correct answer for a short session, a workout the watch recorded without
 * heart rate, and a screenshot — none of those are evidence of anything.
 */
export function hrSignatureFor(input: {
  samples?: HealthHeartRateSample[] | null;
  series?: number[] | null;
  durationSec: number;
}): HrSignature | null {
  if (!Number.isFinite(input.durationSec) || input.durationSec < MIN_DURATION_SEC) {
    return null;
  }
  const readings = readingsFrom(input);
  if (readings.length < MIN_POINTS) {
    return null;
  }
  const bpms = readings.map((entry) => entry.bpm);
  const sorted = [...bpms].sort((left, right) => left - right);
  const last = readings[readings.length - 1].min;
  return {
    points: readings.length,
    mean: round(mean(bpms)),
    peak: percentile(sorted, 0.95),
    floor: percentile(sorted, 0.05),
    sd: round(stdDev(bpms)),
    onsetBpmPerMin: nullableRound(slope(readings.filter((entry) => entry.min <= ONSET_WINDOW_MIN))),
    recoveryBpmPerMin: nullableRound(
      slope(readings.filter((entry) => entry.min >= last - RECOVERY_WINDOW_MIN)),
    ),
  };
}

function nullableRound(value: number | null): number | null {
  return value == null ? null : round(value);
}
