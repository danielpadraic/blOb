import type { OcrSessionFields } from '@/lib/health/ocrSession';
import type { OcrClockRange } from '@/lib/health/workoutOcr';
import { mediaUrlKey } from '@/lib/challengeProofs';

const FIELD_KEYS = [
  'durationSec',
  'activeEnergyKcal',
  'totalEnergyKcal',
  'minHrBpm',
  'avgHrBpm',
  'maxHrBpm',
  'distanceMeters',
] as const;

export function ocrStillKey(proofId: string, uri: string): string {
  return `${proofId}::${mediaUrlKey(uri) || uri}`;
}

/**
 * Combine reads from several tracker screens. First confident value for each field wins — never an
 * average, and a later miss never overwrites a number that already landed.
 */
export function unionOcrFields(
  reads: Array<{
    fields?: OcrSessionFields | null;
    clockRange?: OcrClockRange | null;
    activityLabel?: string | null;
  }>,
): {
  fields: OcrSessionFields;
  clockRange: OcrClockRange | null;
  activityLabel: string | null;
} {
  const fields: OcrSessionFields = {};
  let clockRange: OcrClockRange | null = null;
  let activityLabel: string | null = null;
  for (const read of reads) {
    const next = read.fields ?? {};
    for (const key of FIELD_KEYS) {
      const value = next[key];
      if (fields[key] != null) {
        continue;
      }
      if (value != null && Number(value) > 0) {
        fields[key] = value;
      }
    }
    if (!clockRange && read.clockRange) {
      clockRange = read.clockRange;
    }
    if (!activityLabel && String(read.activityLabel ?? '').trim()) {
      activityLabel = String(read.activityLabel).trim();
    }
  }
  return { fields, clockRange, activityLabel };
}
