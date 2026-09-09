import { describe, expect, it } from 'vitest';

import {
  composeCheckinNotes,
  healthAttachRulesFor,
  healthCompleteSummaryLine,
  proofPrefersHealthAttach,
  stripHealthSummaryFromNotes,
  toCheckinHealthProof,
  workoutAttachBlockReason,
} from '@/lib/health/attachProof';
import { MIN_AVG_HR_BPM } from '@/lib/health/workoutProofGate';
import { parseCheckinHealthProof } from '@/lib/health/checkinHealthProof';
import { last24Hours } from '@/lib/health/period';
import { parseProofParts } from '@/lib/challengeProofs';
import type { HealthWorkout } from '@/services/health/types';

const run: HealthWorkout = {
  providerWorkoutId: 'hk-1',
  source: 'apple_health',
  activityType: 'running',
  activityLabel: 'Outdoor Run',
  startedAt: '2026-08-26T13:02:00.000Z',
  endedAt: '2026-08-26T13:41:00.000Z',
  durationSec: 39 * 60,
  caloriesKcal: 320,
  distanceM: 6200,
  hrAvg: 148,
  hrMax: 172,
  confidence: 'watch',
};

describe('proofPrefersHealthAttach', () => {
  it('prefers Watch attach for HR and duration proofs, not selfies', () => {
    expect(proofPrefersHealthAttach({ id: 'hr', name: 'Heart rate', method: 'hr' })).toBe(true);
    expect(proofPrefersHealthAttach({ id: 'd', name: 'Distance', method: 'distance' })).toBe(true);
    expect(
      proofPrefersHealthAttach(
        { id: 'photo', name: 'Photo of the work', method: 'photo' },
        { min_minutes: 30, title: 'Morning run', proofs: [{ id: 'photo', name: 'Photo of the work', method: 'photo' }] },
      ),
    ).toBe(true);
    expect(
      proofPrefersHealthAttach(
        { id: 'pre', name: 'Pre-workout selfie', method: 'photo' },
        { proofs: [{ id: 'hr', name: 'Heart rate', method: 'hr' }] },
      ),
    ).toBe(false);
  });
});

describe('workoutAttachBlockReason', () => {
  it('blocks short workouts and missing HR when required', () => {
    expect(workoutAttachBlockReason(run, { minMinutes: 30, hrRequired: true })).toBeNull();
    expect(workoutAttachBlockReason({ ...run, durationSec: 10 * 60 }, { minMinutes: 30 })).toBe(
      'Needs at least 30 min',
    );
    expect(workoutAttachBlockReason({ ...run, hrAvg: undefined, hrMax: undefined }, { hrRequired: true })).toBe(
      'No heart rate on this workout',
    );
  });

  it('uses the stricter of challenge minutes and HR proof minutes', () => {
    expect(healthAttachRulesFor({ id: 'hr', name: 'HR', method: 'hr', minutes: 45 }, { min_minutes: 30 })).toEqual({
      minMinutes: 45,
      hrRequired: true,
      minDistanceMeters: null,
      elevatedHrBpm: MIN_AVG_HR_BPM,
      elevatedHrUnknownAge: true,
    });
  });

  it('accepts a walk at 82 and blocks 79 when heart rate is required', () => {
    const rules = { minMinutes: 30, hrRequired: true, elevatedHrBpm: MIN_AVG_HR_BPM };
    expect(workoutAttachBlockReason({ ...run, hrAvg: 82, activityType: 'walking' }, rules)).toBeNull();
    expect(workoutAttachBlockReason({ ...run, hrAvg: 80, activityType: 'walking' }, rules)).toBeNull();
    expect(workoutAttachBlockReason({ ...run, hrAvg: 79, activityType: 'walking' }, rules)).toBe(
      'Needs average heart rate 80+',
    );
  });
});

describe('check-in health snapshot', () => {
  it('stores allowed fields only and builds the complete-post line', () => {
    const snapshot = toCheckinHealthProof(run);
    expect(snapshot).toEqual({
      source: 'healthkit',
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      durationSec: 39 * 60,
      activityType: 'running',
      sourceName: 'Apple Watch',
      avgHrBpm: 148,
      maxHrBpm: 172,
      activeEnergyKcal: 320,
      distanceMeters: 6200,
    });
    expect(snapshot).not.toHaveProperty('route');
    expect(healthCompleteSummaryLine(snapshot)).toMatch(/39:00/);
    expect(healthCompleteSummaryLine(snapshot)).toMatch(/Average heart rate 148/);
  });

  it('omits HR and energy when the workout has no samples', () => {
    const snapshot = toCheckinHealthProof({
      ...run,
      hrAvg: undefined,
      hrMax: undefined,
      caloriesKcal: undefined,
      distanceM: undefined,
    });
    expect(snapshot.avgHrBpm).toBeUndefined();
    expect(snapshot.activeEnergyKcal).toBeUndefined();
    expect(healthCompleteSummaryLine(snapshot)).not.toMatch(/Average heart rate/);
  });

  it('keeps the user caption and prepends the summary on the check-in notes', () => {
    const snapshot = toCheckinHealthProof(run);
    const notes = composeCheckinNotes('Felt strong', snapshot);
    expect(notes?.startsWith(healthCompleteSummaryLine(snapshot))).toBe(true);
    expect(notes).toContain('Felt strong');
    expect(stripHealthSummaryFromNotes(notes ?? '', snapshot)).toBe('Felt strong');
  });

  it('stores the heart-rate trace, so the card can be drawn again with its graph', () => {
    const samples = [104, 118, 131].map((bpm, index) => ({
      at: new Date(Date.UTC(2026, 8, 5, 20, index)).toISOString(),
      bpm,
    }));
    const snapshot = toCheckinHealthProof(run, samples);
    expect(snapshot.hrSeries).toEqual([104, 118, 131]);
    // Unchanged when the caller has no series to give: an attach on Web reads no samples, and the rest
    // of the snapshot must still be stored.
    expect(toCheckinHealthProof(run)).not.toHaveProperty('hrSeries');
    expect(toCheckinHealthProof(run, [])).not.toHaveProperty('hrSeries');
  });

  it('keeps the trace through a round trip on proof_parts, and refuses one on a screenshot row', () => {
    const stored = {
      source: 'healthkit',
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      durationSec: run.durationSec,
      activityType: 'running',
      sourceName: 'Apple Watch',
      avgHrBpm: 148,
      hrSeries: [104, 118, 131],
    };
    expect(parseCheckinHealthProof(stored)?.hrSeries).toEqual([104, 118, 131]);
    // A screenshot read gives numbers, never a series — the same rule the GPS route follows.
    expect(parseCheckinHealthProof({ ...stored, source: 'ocr' })?.hrSeries).toBeUndefined();
  });

  it('round-trips on proof_parts', () => {
    const snapshot = toCheckinHealthProof(run);
    const parts = parseProofParts({
      hr: { method: 'hr', url: '', healthWorkoutId: 'row-1', health: snapshot },
    });
    expect(parseCheckinHealthProof(parts.hr?.health)).toEqual(snapshot);
    expect(parts.hr?.healthWorkoutId).toBe('row-1');
  });
});

describe('health query window', () => {
  it('falls back to the last 24 hours', () => {
    const now = new Date('2026-08-26T18:00:00.000Z');
    const window = last24Hours(now);
    expect(window.to.toISOString()).toBe(now.toISOString());
    expect(window.from.toISOString()).toBe('2026-08-25T18:00:00.000Z');
  });
});
