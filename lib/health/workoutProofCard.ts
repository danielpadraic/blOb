import { routeActivityFor, type RouteActivity, type WorkoutRoute } from '@/lib/health/route';
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

/**
 * Card-local accent per activity. The theme palette is one teal, which makes every recap look like
 * the same grey receipt; a run and a ride should not be the same colour. These live here rather than
 * in lib/theme.ts because they belong to this artifact only and must not become app chrome.
 */
export type WorkoutCardAccent = {
  /** Line, glyph and headline tint. */
  accent: string;
  /** Deeper end of the field gradient. */
  fieldTop: string;
  fieldBottom: string;
  /** Wash behind the map / stats hero. */
  panel: string;
};

const ACCENTS: Record<RouteActivity, WorkoutCardAccent> = {
  run: { accent: '#FF7A4D', fieldTop: '#1A1310', fieldBottom: '#0D0B0A', panel: 'rgba(255, 122, 77, 0.10)' },
  ride: { accent: '#8B7BFF', fieldTop: '#14121D', fieldBottom: '#0B0A10', panel: 'rgba(139, 123, 255, 0.10)' },
  walk: { accent: '#72D9CB', fieldTop: '#101817', fieldBottom: '#0A0F0E', panel: 'rgba(114, 217, 203, 0.10)' },
  hike: { accent: '#8FD14F', fieldTop: '#121711', fieldBottom: '#0A0E09', panel: 'rgba(143, 209, 79, 0.10)' },
  other: { accent: '#72D9CB', fieldTop: '#111414', fieldBottom: '#0A0C0C', panel: 'rgba(114, 217, 203, 0.10)' },
};

export function workoutCardAccent(activityType?: string | null): WorkoutCardAccent {
  return ACCENTS[routeActivityFor(activityType)];
}

export type WorkoutProofCardModel = {
  dateLine: string;
  activityLabel: string;
  timeRange: string;
  placeLine: string | null;
  stats: WorkoutProofStat[];
  distanceLine: string | null;
  /** The headline number: distance for outdoor work, elapsed time otherwise. */
  headline: { value: string; label: string };
  /** The GPS track to draw, or null for indoor / unavailable. Never a placeholder. */
  route: WorkoutRoute | null;
  accent: WorkoutCardAccent;
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
export const WORKOUT_CARD_CHART = { width: 872, height: 176 } as const;

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

/**
 * Fill hrMin (and hrAvg when the summary lacked it) from the sample series. HealthKit's workout
 * summary carries no minimum, so it can only come from the samples.
 */
export function withHeartRateFloor(workout: HealthWorkout, samples: HeartRateSample[]): HealthWorkout {
  const clean = cleanSamples(samples);
  if (clean.length === 0) {
    return workout;
  }
  const values = clean.map((sample) => sample.bpm);
  const next: HealthWorkout = { ...workout, hrMin: Math.min(...values) };
  if (!(Number(next.hrAvg) > 0)) {
    next.hrAvg = Math.round(values.reduce((total, bpm) => total + bpm, 0) / values.length);
  }
  if (!(Number(next.hrMax) > 0)) {
    next.hrMax = Math.max(...values);
  }
  return next;
}

/**
 * HealthKit's own workout average wins over the mean of the series. The series is capped, so its
 * mean can drift a few BPM from what the user sees in Fitness — and this card is a proof artifact,
 * so it must not disagree with Apple's number.
 */
export function workoutCardHeartRateAverage(samples: HeartRateSample[], reported?: number | null): number | null {
  const stated = Number(reported);
  if (Number.isFinite(stated) && stated > 0) {
    return Math.round(stated);
  }
  const clean = cleanSamples(samples);
  if (clean.length > 0) {
    const sum = clean.reduce((total, sample) => total + sample.bpm, 0);
    return Math.round(sum / clean.length);
  }
  const avg = Number(reported);
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
  /** Stored GPS track. Omit or pass null for indoor work — the card then leads with the numbers. */
  route?: WorkoutRoute | null;
}): WorkoutProofCardModel {
  const samples = input.samples ?? [];
  const sparkline = workoutCardSparkline(samples);
  const avg = workoutCardHeartRateAverage(samples, input.workout.hrAvg);
  const max = Number(input.workout.hrMax);
  const distance = workoutCardDistance(input.workout.distanceM);
  const duration = workoutCardDuration(input.workout.durationSec);
  const route = input.route ?? null;

  // Distance leads when the workout covered ground; otherwise elapsed time is the achievement.
  const headline = distance
    ? { value: distance, label: 'Distance' }
    : { value: duration, label: 'Workout time' };

  // The headline number is not repeated in the strip below it.
  const stats: WorkoutProofStat[] = [];
  if (distance) {
    stats.push({ key: 'duration', label: 'Time', value: duration });
  }
  const active = Number(input.workout.caloriesKcal);
  if (Number.isFinite(active) && active > 0) {
    stats.push({ key: 'active', label: 'Active cal', value: `${Math.round(active)}` });
  }
  if (avg != null) {
    stats.push({ key: 'hr', label: 'Avg HR', value: `${avg}` });
  }
  if (Number.isFinite(max) && max > 0) {
    stats.push({ key: 'hrmax', label: 'Max HR', value: `${Math.round(max)}` });
  }

  return {
    headline,
    route,
    accent: workoutCardAccent(input.workout.activityType),
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
