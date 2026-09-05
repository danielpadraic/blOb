import { zonedDateTimeToUtc } from '@/lib/challengeTimezone';
import type { CheckinHealthProof, CheckinHealthSource } from '@/lib/health/checkinHealthProof';
import type { ChallengeProof } from '@/lib/types';
import type { OcrClockRange, ParsedWorkoutOcr } from '@/lib/health/workoutOcr';

/**
 * Turns a screenshot read into the shape the check-in already stores.
 *
 * The one rule that matters here: a workout window is only ever set from a wall-clock range the
 * screen actually showed, resolved in the challenge timezone. Nothing is derived from the clock at
 * submit time, and duration always comes from the elapsed time on the screen rather than from the
 * window, so the two can never silently disagree.
 */

export type OcrSessionFields = {
  durationSec?: number;
  activeEnergyKcal?: number;
  totalEnergyKcal?: number;
  minHrBpm?: number;
  avgHrBpm?: number;
  maxHrBpm?: number;
  distanceMeters?: number;
};

/**
 * Resolves the parsed clock range against the check-in's own calendar day, in the challenge
 * timezone. Returns null when the screen showed no range.
 */
export function ocrWorkoutWindow(input: {
  /** Range the screen showed. Null or absent means leave the window empty. */
  range?: OcrClockRange | null;
  /** Calendar day the check-in belongs to, as YYYY-MM-DD in the challenge timezone. */
  periodKey: string;
  timeZone: string;
}): { startedAt: string; endedAt: string } | null {
  const range = input.range;
  if (!range) {
    return null;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(input.periodKey ?? '').trim());
  if (!match) {
    return null;
  }
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);

  const start = zonedDateTimeToUtc(year, month, day, range.start.hour, range.start.minute, input.timeZone);
  let end = zonedDateTimeToUtc(year, month, day, range.end.hour, range.end.minute, input.timeZone);

  // A session that reads 11:40 PM - 12:15 AM crossed midnight, so the end belongs to the next day.
  if (end.getTime() < start.getTime()) {
    end = zonedDateTimeToUtc(year, month, day + 1, range.end.hour, range.end.minute, input.timeZone);
  }
  if (end.getTime() <= start.getTime()) {
    return null;
  }
  return { startedAt: start.toISOString(), endedAt: end.toISOString() };
}

/**
 * Builds the stored snapshot. `source` is 'manual' once the user has corrected any chip, so an
 * edited number is never presented as something a device reported.
 */
export function buildOcrHealthProof(input: {
  fields: OcrSessionFields;
  source: Extract<CheckinHealthSource, 'ocr' | 'manual'>;
  activityLabel?: string | null;
  /** Range the screen showed, when it showed one. */
  clockRange?: OcrClockRange | null;
  periodKey?: string | null;
  timeZone?: string | null;
}): CheckinHealthProof | null {
  const fields = input.fields ?? {};
  const hasNumbers =
    fields.durationSec != null ||
    fields.activeEnergyKcal != null ||
    fields.totalEnergyKcal != null ||
    fields.avgHrBpm != null ||
    fields.maxHrBpm != null ||
    fields.distanceMeters != null;
  if (!hasNumbers) {
    return null;
  }

  const snapshot: CheckinHealthProof = {
    source: input.source,
    activityType: activityTypeFromLabel(input.activityLabel),
    sourceName: input.source === 'manual' ? 'Entered by hand' : 'Workout screenshot',
  };

  if (input.clockRange && input.periodKey && input.timeZone) {
    const window = ocrWorkoutWindow({
      range: input.clockRange,
      periodKey: input.periodKey,
      timeZone: input.timeZone,
    });
    if (window) {
      snapshot.startedAt = window.startedAt;
      snapshot.endedAt = window.endedAt;
    }
  }

  // Duration is always the elapsed time from the screen, never the span of the window above.
  if (fields.durationSec != null) {
    snapshot.durationSec = fields.durationSec;
  }
  if (fields.activeEnergyKcal != null) {
    snapshot.activeEnergyKcal = fields.activeEnergyKcal;
  }
  if (fields.totalEnergyKcal != null) {
    snapshot.totalEnergyKcal = fields.totalEnergyKcal;
  }
  if (fields.minHrBpm != null) {
    snapshot.minHrBpm = fields.minHrBpm;
  }
  if (fields.avgHrBpm != null) {
    snapshot.avgHrBpm = fields.avgHrBpm;
  }
  if (fields.maxHrBpm != null) {
    snapshot.maxHrBpm = fields.maxHrBpm;
  }
  if (fields.distanceMeters != null) {
    snapshot.distanceMeters = fields.distanceMeters;
  }
  return snapshot;
}

/** Maps a read activity label onto the same buckets the rest of the app uses. */
export function activityTypeFromLabel(label?: string | null): string {
  const name = String(label ?? '').toLowerCase();
  if (!name) {
    return 'other';
  }
  if (name.includes('run')) {
    return 'running';
  }
  if (name.includes('walk') || name.includes('hik')) {
    return 'walking';
  }
  if (name.includes('ride') || name.includes('cycl') || name.includes('bike') || name.includes('spin')) {
    return 'cycling';
  }
  if (
    name.includes('strength') ||
    name.includes('interval') ||
    name.includes('hiit') ||
    name.includes('core') ||
    name.includes('functional')
  ) {
    return 'strength';
  }
  return 'other';
}

/** Fields the parser produced, narrowed to the ones we persist. */
export function ocrFieldsFromParse(parsed?: ParsedWorkoutOcr | null): OcrSessionFields {
  if (!parsed) {
    return {};
  }
  const fields: OcrSessionFields = {};
  if (parsed.durationSec != null) {
    fields.durationSec = parsed.durationSec;
  }
  if (parsed.activeEnergyKcal != null) {
    fields.activeEnergyKcal = parsed.activeEnergyKcal;
  }
  if (parsed.totalEnergyKcal != null) {
    fields.totalEnergyKcal = parsed.totalEnergyKcal;
  }
  if (parsed.minHrBpm != null) {
    fields.minHrBpm = parsed.minHrBpm;
  }
  if (parsed.avgHrBpm != null) {
    fields.avgHrBpm = parsed.avgHrBpm;
  }
  if (parsed.maxHrBpm != null) {
    fields.maxHrBpm = parsed.maxHrBpm;
  }
  if (parsed.distanceMeters != null) {
    fields.distanceMeters = parsed.distanceMeters;
  }
  return fields;
}

/**
 * Only tracker and heart-rate slots are read. Face selfies, Waves, Rounds and feed photos are never
 * sent to the reader.
 */
export function isOcrEligibleProof(proof: Pick<ChallengeProof, 'method'>): boolean {
  return proof.method === 'hr' || proof.method === 'distance';
}

/** A still we should read: a local screenshot, not a vendor attach and not our own generated card. */
export function shouldReadWorkoutStill(input: {
  proof: Pick<ChallengeProof, 'method'>;
  uri?: string;
  mimeType?: string | null;
  health?: CheckinHealthProof | null;
  healthWorkoutId?: string | null;
  building?: boolean;
}): boolean {
  if (!isOcrEligibleProof(input.proof)) {
    return false;
  }
  const uri = String(input.uri ?? '');
  if (!uri || uri.startsWith('health:') || input.building) {
    return false;
  }
  if (String(input.mimeType ?? '').startsWith('video/')) {
    return false;
  }
  // Our own workout card already carries exact vendor numbers; re-reading it would only add noise.
  if (input.healthWorkoutId) {
    return false;
  }
  // A HealthKit / Health Connect attach is authoritative and must never be overwritten by a guess.
  const source = input.health?.source;
  if (source === 'healthkit' || source === 'health_connect') {
    return false;
  }
  return true;
}
