import type { HealthHeartRateSample } from '@/services/health/types';

/**
 * The heart-rate trace, stored so a card can be drawn again from the row.
 *
 * The card used to graph the sample series it had just read from HealthKit, which worked for exactly
 * as long as the card stayed a flattened JPEG. Now that a posted card is redrawn from what is stored,
 * the graph vanished from every card: the summary keeps the average, the minimum and the maximum, but
 * a trace cannot be recovered from three numbers. So the series travels with the snapshot, the same
 * way the GPS route already does.
 *
 * Only BPM is kept, in order. The card's x axis is sample position, so timestamps would be stored and
 * never read — and a workout's sample times are the closest thing in here to a location trail.
 */

/** Points kept per workout. A 2-hour walk reads ~400 samples; 120 draws the same shape. */
const MAX_POINTS = 120;

/** Rates outside this are a sensor fault, not a heartbeat, and would flatten the whole graph. */
const MIN_BPM = 20;
const MAX_BPM = 260;

function usable(value: unknown): number | null {
  const bpm = Math.round(Number(value));
  if (!Number.isFinite(bpm) || bpm < MIN_BPM || bpm > MAX_BPM) {
    return null;
  }
  return bpm;
}

/**
 * Thin a series to at most MAX_POINTS by averaging each bucket.
 *
 * Averaging rather than sampling every nth reading, because dropping readings can drop the peak — and
 * the maximum is a number the card prints beside the graph.
 */
function downsample(values: number[]): number[] {
  if (values.length <= MAX_POINTS) {
    return values;
  }
  const out: number[] = [];
  const bucket = values.length / MAX_POINTS;
  for (let index = 0; index < MAX_POINTS; index += 1) {
    const from = Math.floor(index * bucket);
    const to = Math.max(Math.floor((index + 1) * bucket), from + 1);
    let total = 0;
    for (let at = from; at < to; at += 1) {
      total += values[at];
    }
    out.push(Math.round(total / (to - from)));
  }
  return out;
}

/**
 * The series to store for these samples, or null when the workout carried no usable heart rate.
 *
 * A single reading is kept: the card draws it as a flat line, which is what that workout was.
 */
export function toStoredHrSeries(samples: HealthHeartRateSample[]): number[] | null {
  if (!Array.isArray(samples)) {
    return null;
  }
  const values: number[] = [];
  for (const sample of samples) {
    const bpm = usable(sample?.bpm);
    if (bpm != null) {
      values.push(bpm);
    }
  }
  return values.length > 0 ? downsample(values) : null;
}

/** A stored series read back, or null when the row has none. Tolerates jsonb numerics as strings. */
export function parseHrSeries(value: unknown): number[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const values: number[] = [];
  for (const entry of value) {
    const bpm = usable(entry);
    if (bpm != null) {
      values.push(bpm);
    }
  }
  // A series thinned somewhere else could still arrive long; the cap is enforced on read as well so a
  // card can never be handed thousands of points to draw.
  return values.length > 0 ? downsample(values) : null;
}
