import { parseWorkoutRoute, type WorkoutRoute } from '@/lib/health/route';

/** Structured Health proof stored on the check-in (`proof_parts`), not a profile field. */

/**
 * Where the numbers came from. This governs whether a workout window is required:
 * a vendor attach always knows when the workout happened, a screenshot often does not.
 */
export type CheckinHealthSource = 'healthkit' | 'health_connect' | 'ocr' | 'manual';

const SOURCES: CheckinHealthSource[] = ['healthkit', 'health_connect', 'ocr', 'manual'];

/** Vendor attaches carry a real workout window and must keep requiring one. */
export function sourceRequiresClocks(source: CheckinHealthSource): boolean {
  return source === 'healthkit' || source === 'health_connect';
}

export type CheckinHealthProof = {
  source: CheckinHealthSource;
  /**
   * The real workout window. Required for healthkit / health_connect. For ocr / manual it is only
   * set when the screenshot actually showed a wall-clock range, and is never invented from the
   * clock at submit time — a guessed window on a proof artifact is worse than no window.
   */
  startedAt?: string;
  endedAt?: string;
  /** Elapsed time as stated by the vendor or read off the screen. Never derived from a window. */
  durationSec?: number;
  activityType: string;
  sourceName: string;
  avgHrBpm?: number;
  maxHrBpm?: number;
  /** From the HR sample series, so it is only present when samples were read. */
  minHrBpm?: number;
  activeEnergyKcal?: number;
  totalEnergyKcal?: number;
  distanceMeters?: number;
  /**
   * The GPS track, when the workout had one. Absent means indoor, location denied, or too few
   * fixes — never a placeholder line. OCR and hand-entered sessions never set this.
   */
  route?: WorkoutRoute | null;
};

function positiveInt(value: unknown): number | undefined {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return undefined;
  }
  return Math.round(number);
}

function isoOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function parseCheckinHealthProof(value: unknown): CheckinHealthProof | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const row = value as Record<string, unknown>;

  // Rows written before OCR existed carry no source and were always HealthKit attaches.
  const rawSource = typeof row.source === 'string' ? (row.source as CheckinHealthSource) : 'healthkit';
  const source = SOURCES.includes(rawSource) ? rawSource : 'healthkit';

  const startedAt = isoOrNull(row.startedAt);
  const endedAt = isoOrNull(row.endedAt);
  const durationSec = positiveInt(row.durationSec);
  const activityType = typeof row.activityType === 'string' ? row.activityType : null;
  const sourceName = typeof row.sourceName === 'string' ? row.sourceName : null;

  if (!activityType || !sourceName) {
    return null;
  }
  if (sourceRequiresClocks(source)) {
    if (!startedAt || !endedAt || durationSec == null) {
      return null;
    }
  }

  const snapshot: CheckinHealthProof = { source, activityType, sourceName };
  if (startedAt) {
    snapshot.startedAt = startedAt;
  }
  if (endedAt) {
    snapshot.endedAt = endedAt;
  }
  if (durationSec != null) {
    snapshot.durationSec = durationSec;
  }

  const avg = positiveInt(row.avgHrBpm);
  const max = positiveInt(row.maxHrBpm);
  const min = positiveInt(row.minHrBpm);
  const active = positiveInt(row.activeEnergyKcal);
  const total = positiveInt(row.totalEnergyKcal);
  const distance = positiveInt(row.distanceMeters);
  if (avg != null) {
    snapshot.avgHrBpm = avg;
  }
  if (max != null) {
    snapshot.maxHrBpm = max;
  }
  if (min != null) {
    snapshot.minHrBpm = min;
  }
  if (active != null) {
    snapshot.activeEnergyKcal = active;
  }
  if (total != null) {
    snapshot.totalEnergyKcal = total;
  }
  if (distance != null) {
    snapshot.distanceMeters = distance;
  }

  // Only a vendor attach can carry coordinates. A screenshot read never invents a location, so a
  // route on an ocr or manual row is discarded rather than trusted. This is deliberately its own
  // check rather than reusing the clock rule, which happens to cover the same two sources today.
  if (source === 'healthkit' || source === 'health_connect') {
    const route = parseWorkoutRoute(row.route);
    if (route) {
      snapshot.route = route;
    }
  }

  // A screenshot read that produced no numbers at all is not proof of anything.
  if (!sourceRequiresClocks(source) && !hasAnyMetric(snapshot)) {
    return null;
  }
  return snapshot;
}

export function hasAnyMetric(snapshot: CheckinHealthProof): boolean {
  return (
    snapshot.durationSec != null ||
    snapshot.activeEnergyKcal != null ||
    snapshot.totalEnergyKcal != null ||
    snapshot.avgHrBpm != null ||
    snapshot.maxHrBpm != null ||
    snapshot.distanceMeters != null
  );
}
