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
    });
  });
});

describe('check-in health snapshot', () => {
  it('stores allowed fields only and builds the complete-post line', () => {
    const snapshot = toCheckinHealthProof(run);
    expect(snapshot).toEqual({
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
    expect(healthCompleteSummaryLine(snapshot)).toMatch(/39 min/);
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
