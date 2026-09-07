import type { HealthHeartRateSample } from '@/services/health/types';

/**
 * Turning a vendor's heart-rate records into one ordered trace.
 *
 * Health Connect does not hand back a workout's heart rate as a series. It stores `HeartRate`
 * records that each carry their own list of readings, so a single workout's trace is spread across
 * however many records happened to be written while it was running, and neither the records nor
 * their contents are guaranteed to arrive in time order. A graph drawn from that without sorting
 * is a scribble.
 *
 * Kept here rather than in the Health Connect adapter because it is ordinary logic with no native
 * dependency, and because the same readings feed both the graph and the average and maximum
 * printed beside it — one definition is what stops those two disagreeing.
 */

/** As much of a vendor record as this needs: a window, and readings inside it. */
export type HeartRateRecord = {
  startTime?: string;
  endTime?: string;
  samples?: Array<{ time?: string; beatsPerMinute?: number; value?: number }>;
};

/** Whether a record's own span touches the window at all, so far-off records are never scanned. */
export function overlapsWindow(
  start: string | undefined,
  end: string | undefined,
  from: number,
  to: number,
): boolean {
  const startMs = start ? new Date(start).getTime() : NaN;
  const endMs = end ? new Date(end).getTime() : NaN;
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
    return false;
  }
  return startMs < to && endMs > from;
}

/**
 * Every usable reading inside the window, oldest first.
 *
 * A reading with no readable timestamp is kept and treated as being at the start of the window: it
 * is still a measurement of this workout, and dropping it would pull the average toward whichever
 * part of the session happened to be timestamped properly.
 */
export function samplesWithin(
  records: readonly HeartRateRecord[],
  from: number,
  to: number,
): HealthHeartRateSample[] {
  if (!Array.isArray(records) || !Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return [];
  }
  const ordered: Array<HealthHeartRateSample & { sort: number }> = [];
  for (const record of records) {
    if (!overlapsWindow(record?.startTime, record?.endTime, from, to)) {
      continue;
    }
    for (const sample of record.samples ?? []) {
      const bpm = Number(sample?.beatsPerMinute ?? sample?.value);
      if (!Number.isFinite(bpm) || bpm <= 0) {
        continue;
      }
      const at = sample?.time ? new Date(sample.time).getTime() : NaN;
      if (!Number.isNaN(at) && (at < from || at > to)) {
        continue;
      }
      const stamp = Number.isNaN(at) ? from : at;
      ordered.push({ at: new Date(stamp).toISOString(), bpm: Math.round(bpm), sort: stamp });
    }
  }
  ordered.sort((a, b) => a.sort - b.sort);
  return ordered.map(({ at, bpm }) => ({ at, bpm }));
}
