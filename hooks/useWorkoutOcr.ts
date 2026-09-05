import { useCallback, useRef, useState } from 'react';

import type { CheckinHealthProof } from '@/lib/health/checkinHealthProof';
import { readWorkoutScreenshot } from '@/lib/health/ocrClient';
import {
  buildOcrHealthProof,
  isOcrEligibleProof,
  ocrFieldsFromParse,
  shouldReadWorkoutStill,
  type OcrSessionFields,
} from '@/lib/health/ocrSession';
import type { OcrClockRange } from '@/lib/health/workoutOcr';

/**
 * Reads workout screenshots for the tracker slots of a check-in.
 *
 * Everything here is advisory. The photo is the proof, so a read that fails, times out, or returns
 * a selfie leaves Send exactly as it was and simply shows no chips.
 */

export { isOcrEligibleProof, shouldReadWorkoutStill };

export type WorkoutOcrStatus = 'reading' | 'ready' | 'empty' | 'failed';

export type WorkoutOcrEntry = {
  status: WorkoutOcrStatus;
  fields: OcrSessionFields;
  /** Flips to manual the moment the athlete corrects any chip. */
  source: 'ocr' | 'manual';
  clockRange?: OcrClockRange | null;
  activityLabel?: string | null;
};

export function useWorkoutOcr(options: { periodKey?: string | null; timeZone: string }) {
  const [entries, setEntries] = useState<Record<string, WorkoutOcrEntry>>({});
  /** Tracks the still each slot was last read for, so one photo is read once. */
  const readFor = useRef<Record<string, string>>({});

  const read = useCallback(async (proofId: string, uri: string) => {
    if (!proofId || !uri) {
      return;
    }
    if (readFor.current[proofId] === uri) {
      return;
    }
    readFor.current[proofId] = uri;
    setEntries((current) => ({
      ...current,
      [proofId]: { status: 'reading', fields: {}, source: 'ocr' },
    }));

    const result = await readWorkoutScreenshot({ localUri: uri });
    setEntries((current) => {
      // A newer still landed while this read was in flight; that read owns the slot now.
      if (readFor.current[proofId] !== uri) {
        return current;
      }
      if (!result.ok || !result.isWorkoutScreen || !result.parsed) {
        return {
          ...current,
          [proofId]: { status: result.isWorkoutScreen ? 'empty' : 'failed', fields: {}, source: 'ocr' },
        };
      }
      const fields = ocrFieldsFromParse(result.parsed);
      const found = Object.keys(fields).length > 0;
      return {
        ...current,
        [proofId]: {
          status: found ? 'ready' : 'empty',
          fields,
          source: 'ocr',
          clockRange: result.parsed.clockRange ?? null,
          activityLabel: result.parsed.activityLabel ?? null,
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
          status: hasNumbers ? 'ready' : 'empty',
          fields,
          source: 'manual',
          clockRange: entry?.clockRange ?? null,
          activityLabel: entry?.activityLabel ?? null,
        },
      };
    });
  }, []);

  const forget = useCallback((proofId: string) => {
    delete readFor.current[proofId];
    setEntries((current) => {
      if (!(proofId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[proofId];
      return next;
    });
  }, []);

  /** The snapshot to store on this slot, or null when nothing was read. */
  const healthFor = useCallback(
    (proofId: string): CheckinHealthProof | null => {
      const entry = entries[proofId];
      if (!entry || entry.status !== 'ready') {
        return null;
      }
      return buildOcrHealthProof({
        fields: entry.fields,
        source: entry.source,
        activityLabel: entry.activityLabel,
        clockRange: entry.clockRange,
        periodKey: options.periodKey,
        timeZone: options.timeZone,
      });
    },
    [entries, options.periodKey, options.timeZone],
  );

  return { entries, read, edit, forget, healthFor };
}
