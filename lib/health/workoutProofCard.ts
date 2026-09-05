import type { HealthHeartRateSample, HealthWorkout } from '@/services/health/types';

/** One HealthKit BPM reading inside the workout window. */
export type HeartRateSample = HealthHeartRateSample;

export type WorkoutProofStat = { key: string; label: string; value: string };

export type WorkoutProofSparkline = {
  /** SVG path in the 0..width / 0..height box handed to buildWorkoutProofCard. */
  path: string;
  min: number;
  max: number;
  points: number;
};

export type WorkoutProofCardModel = {
  dateLine: string;
  activityLabel: string;
  timeRange: string;
  placeLine: string | null;
  stats: WorkoutProofStat[];
  distanceLine: string | null;
  heartRate: {
    avgLine: string | null;
    minLabel: string | null;
    maxLabel: string | null;
    sparkline: WorkoutProofSparkline | null;
    emptyLine: string | null;
  };
  sourceLine: string;
  proofLine: string;
};

export const WORKOUT_CARD_WIDTH = 1080;
export const WORKOUT_CARD_HEIGHT = 1350;

/** Chart box inside the card. Sparkline geometry is built against these numbers. */
export const WORKOUT_CARD_CHART = { width: 872, height: 210 } as const;

function safeFormat(value: Date, options: Intl.DateTimeFormatOptions, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone }).format(value);
  } catch {
    try {
      return new Intl.DateTimeFormat('en-US', options).format(value);
    } catch {
      return '';
    }
  }
}

/** "Saturday, September 5, 2026" in the challenge timezone. */
export function workoutCardDateLine(startedAt: string, timeZone: string): string {
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) {
    return '';
  }
  return safeFormat(
    start,
    { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' },
    timeZone,
  );
}

/** "7:33 – 8:14 AM" in the challenge timezone. */
export function workoutCardTimeRange(startedAt: string, endedAt: string, timeZone: string): string {
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return '';
  }
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  const startText = safeFormat(start, opts, timeZone);
  const endText = safeFormat(end, opts, timeZone);
  if (!startText || !endText) {
    return '';
  }
  // Drop the leading meridiem when both halves share it: "7:33 – 8:14 AM".
  const startBare = startText.replace(/\s*(AM|PM)$/i, '');
  const sameHalf = startText.slice(-2).toUpperCase() === endText.slice(-2).toUpperCase();
  return `${sameHalf ? startBare : startText} – ${endText}`;
}

/** "0:41:10" — hours are never padded, minutes and seconds always are. */
export function workoutCardDuration(durationSec: number): string {
  const total = Math.max(Math.round(Number(durationSec) || 0), 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/** Miles for US challenge audiences, one decimal. Returns null when there is no distance. */
export function workoutCardDistance(distanceM?: number | null): string | null {
  const meters = Number(distanceM);
  if (!Number.isFinite(meters) || meters <= 0) {
    return null;
  }
  const miles = meters / 1609.344;
  return `${miles < 10 ? miles.toFixed(2) : miles.toFixed(1)} mi`;
}

export function workoutCardSourceLine(confidence: HealthWorkout['confidence']): string {
  if (confidence === 'watch') {
    return 'Recorded on Apple Watch';
  }
  if (confidence === 'phone') {
    return 'Recorded on iPhone';
  }
  if (confidence === 'manual') {
    return 'Entered by hand in Apple Health';
  }
  return 'Recorded in Apple Health';
}

function cleanSamples(samples: HeartRateSample[]): HeartRateSample[] {
  return samples
    .filter((sample) => Number.isFinite(sample.bpm) && sample.bpm > 0)
    .map((sample) => ({ at: sample.at, bpm: Math.round(sample.bpm) }))
    .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

/**
 * Scale samples into the chart box. A flat series would divide by zero, so it rides the
 * middle instead of collapsing onto the top edge.
 */
export function workoutCardSparkline(
  samples: HeartRateSample[],
  box: { width: number; height: number } = WORKOUT_CARD_CHART,
): WorkoutProofSparkline | null {
  const clean = cleanSamples(samples);
  if (clean.length === 0) {
    return null;
  }
  const values = clean.map((sample) => sample.bpm);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const step = clean.length > 1 ? box.width / (clean.length - 1) : 0;
  const points = values.map((bpm, index) => {
    const x = clean.length > 1 ? index * step : box.width / 2;
    const ratio = span > 0 ? (bpm - min) / span : 0.5;
    const y = box.height - ratio * box.height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const path =
    clean.length === 1
      ? `M0,${(box.height / 2).toFixed(1)} L${box.width.toFixed(1)},${(box.height / 2).toFixed(1)}`
      : `M${points.join(' L')}`;
  return { path, min, max, points: clean.length };
}

export function workoutCardHeartRateAverage(samples: HeartRateSample[], fallback?: number | null): number | null {
  const clean = cleanSamples(samples);
  if (clean.length > 0) {
    const sum = clean.reduce((total, sample) => total + sample.bpm, 0);
    return Math.round(sum / clean.length);
  }
  const avg = Number(fallback);
  return Number.isFinite(avg) && avg > 0 ? Math.round(avg) : null;
}

/**
 * Everything the SVG card draws. Rows with no data are null so the card can omit them
 * rather than print a zero. Body metrics are deliberately absent.
 */
export function buildWorkoutProofCard(input: {
  workout: HealthWorkout;
  samples?: HeartRateSample[];
  timeZone: string;
  challengeTitle: string;
  placeLabel?: string | null;
}): WorkoutProofCardModel {
  const samples = input.samples ?? [];
  const sparkline = workoutCardSparkline(samples);
  const avg = workoutCardHeartRateAverage(samples, input.workout.hrAvg);
  const distance = workoutCardDistance(input.workout.distanceM);

  const stats: WorkoutProofStat[] = [
    { key: 'duration', label: 'Workout time', value: workoutCardDuration(input.workout.durationSec) },
  ];
  const active = Number(input.workout.caloriesKcal);
  if (Number.isFinite(active) && active > 0) {
    stats.push({ key: 'active', label: 'Active cal', value: `${Math.round(active)}` });
  }
  if (avg != null) {
    stats.push({ key: 'hr', label: 'Avg HR', value: `${avg}` });
  }
  if (distance) {
    stats.push({ key: 'distance', label: 'Distance', value: distance });
  }

  return {
    dateLine: workoutCardDateLine(input.workout.startedAt, input.timeZone),
    activityLabel: input.workout.activityLabel?.trim() || 'Workout',
    timeRange: workoutCardTimeRange(input.workout.startedAt, input.workout.endedAt, input.timeZone),
    placeLine: input.placeLabel?.trim() || null,
    stats: stats.slice(0, 4),
    distanceLine: distance,
    heartRate: {
      avgLine: avg != null ? `${avg} BPM AVG` : null,
      minLabel: sparkline ? `${sparkline.min}` : null,
      maxLabel: sparkline ? `${sparkline.max}` : null,
      sparkline,
      emptyLine: sparkline ? null : 'Heart rate not on this workout',
    },
    sourceLine: workoutCardSourceLine(input.workout.confidence),
    proofLine: `Proof for ${input.challengeTitle}`.trim(),
  };
}
