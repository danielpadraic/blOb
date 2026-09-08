import { useCallback, useRef, useState } from 'react';

import type { CheckinHealthProof } from '@/lib/health/checkinHealthProof';
import { isProjectStorageImageUrl } from '@/lib/health/ocrAllowlist';
import { readWorkoutScreenshot } from '@/lib/health/ocrClient';
import {
  buildOcrHealthProof,
  isOcrEligibleProof,
  ocrFieldsFromParse,
  shouldReadWorkoutStill,
  type OcrSessionFields,
} from '@/lib/health/ocrSession';
import { ocrStillKey, unionOcrFields } from '@/lib/health/ocrUnion';
import { hasOcrNumbers, type OcrClockRange } from '@/lib/health/workoutOcr';

/**
 * Reads workout screenshots for the tracker slots of a check-in.
 *
 * Everything here is advisory. The photo is the proof, so a read that fails, times out, or returns
 * a selfie leaves Send exactly as it was and simply shows no chips.
 */

export { isOcrEligibleProof, shouldReadWorkoutStill, ocrStillKey };

export type WorkoutOcrStatus = 'reading' | 'ready' | 'empty' | 'failed';

export type WorkoutOcrEntry = {
  status: WorkoutOcrStatus;
  fields: OcrSessionFields;
  /** Flips to manual the moment the athlete corrects any chip. */
  source: 'ocr' | 'manual';
  clockRange?: OcrClockRange | null;
  activityLabel?: string | null;
  reason?: string;
};

export function useWorkoutOcr(options: { periodKey?: string | null; timeZone: string }) {
  const [entries, setEntries] = useState<Record<string, WorkoutOcrEntry>>({});
  /** Tracks each still that was already sent to the reader. */
  const readFor = useRef<Record<string, string>>({});

  const read = useCallback(async (proofId: string, uri: string) => {
    if (!proofId || !uri) {
      return;
    }
    const key = ocrStillKey(proofId, uri);
    if (readFor.current[key] === uri) {
      return;
    }
    readFor.current[key] = uri;
    setEntries((current) => ({
      ...current,
      [key]: { status: 'reading', fields: {}, source: 'ocr' },
    }));

    const storageUrl = isProjectStorageImageUrl(uri) ? uri : '';
    const result = await readWorkoutScreenshot({
      localUri: uri,
      imageUrl: storageUrl || undefined,
    });
    setEntries((current) => {
      if (readFor.current[key] !== uri) {
        return current;
      }
      if (!result.ok) {
        return {
          ...current,
          [key]: {
            status: 'failed',
            fields: {},
            source: 'ocr',
            reason: result.reason,
          },
        };
      }
      if (!result.isWorkoutScreen) {
        return {
          ...current,
          [key]: {
            status: 'empty',
            fields: {},
            source: 'ocr',
            reason: result.reason,
          },
        };
      }
      const fields = ocrFieldsFromParse(result.parsed);
      const found = hasOcrNumbers(result.parsed) && Object.keys(fields).length > 0;
      return {
        ...current,
        [key]: {
          status: found ? 'ready' : 'empty',
          fields,
          source: 'ocr',
          clockRange: result.parsed?.clockRange ?? null,
          activityLabel: result.parsed?.activityLabel ?? null,
          reason: found ? 'ok' : 'parse_miss',
        },
      };
    });
  }, []);

  /** A hand correction. The session is manual from here on. */
  const edit = useCallback((proofId: string, fields: OcrSessionFields) => {
    setEntries((current) => {
      const entry = current[proofId];
      const hasNumbers = Object.keys(fields).length > 0;
      return {
        ...current,
        [proofId]: {
          status: hasNumbers ? 'ready' : entry?.status === 'failed' ? 'failed' : 'empty',
          fields,
          source: 'manual',
          clockRange: entry?.clockRange ?? null,
          activityLabel: entry?.activityLabel ?? null,
          reason: entry?.reason,
        },
      };
    });
  }, []);

  const forgetStill = useCallback((proofId: string, uri: string) => {
    const key = ocrStillKey(proofId, uri);
    delete readFor.current[key];
    setEntries((current) => {
      if (!(key in current)) {
        return current;
      }
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const forget = useCallback((proofId: string) => {
    const prefix = `${proofId}::`;
    for (const key of Object.keys(readFor.current)) {
      if (key === proofId || key.startsWith(prefix)) {
        delete readFor.current[key];
      }
    }
    setEntries((current) => {
      const next = { ...current };
      let changed = false;
      for (const key of Object.keys(next)) {
        if (key === proofId || key.startsWith(prefix)) {
          delete next[key];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, []);

  const entryFor = useCallback(
    (proofId: string, uri?: string | null): WorkoutOcrEntry | undefined => {
      if (uri) {
        return entries[ocrStillKey(proofId, uri)];
      }
      return entries[proofId];
    },
    [entries],
  );

  /** The snapshot to store on this slot, or null when nothing was read. */
  const healthFor = useCallback(
    (proofId: string, uris?: string[]): CheckinHealthProof | null => {
      const manual = entries[proofId];
      if (manual?.source === 'manual' && Object.keys(manual.fields).length > 0) {
        return buildOcrHealthProof({
          fields: manual.fields,
          source: 'manual',
          activityLabel: manual.activityLabel,
          clockRange: manual.clockRange,
          periodKey: options.periodKey,
          timeZone: options.timeZone,
        });
      }
      const prefix = `${proofId}::`;
      const keys = uris?.length
        ? uris.map((uri) => ocrStillKey(proofId, uri))
        : Object.keys(entries).filter((key) => key.startsWith(prefix));
      const reads = keys.map((key) => entries[key]).filter(Boolean);
      const union = unionOcrFields(reads);
      if (Object.keys(union.fields).length === 0) {
        return null;
      }
      return buildOcrHealthProof({
        fields: union.fields,
        source: 'ocr',
        activityLabel: union.activityLabel,
        clockRange: union.clockRange,
        periodKey: options.periodKey,
        timeZone: options.timeZone,
      });
    },
    [entries, options.periodKey, options.timeZone],
  );

  return { entries, read, edit, forget, forgetStill, healthFor, entryFor };
}
