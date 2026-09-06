import { describe, expect, it } from 'vitest';

import {
  confidenceFromSourceName,
  redrawFor,
  redrawWouldLoseHeartRate,
  workoutFromStoredSession,
} from '@/lib/health/cardRedraw';
import { buildWorkoutProofCard } from '@/lib/health/workoutProofCard';

/**
 * The Eagle walk as the check-in stored it, with the distance the repair migration recovered. The
 * card that is on the post right now says 0.00 mi, because it was drawn when this field held 6.
 */
const WALK = {
  source: 'healthkit' as const,
  startedAt: '2026-09-05T20:01:20.279Z',
  endedAt: '2026-09-05T22:24:57.717Z',
  durationSec: 8617,
  activityType: 'walking',
  sourceName: 'Apple Watch',
  avgHrBpm: 103,
  maxHrBpm: 112,
  minHrBpm: 81,
  activeEnergyKcal: 672,
  distanceMeters: 10042,
};

const SESSION = {
  id: 'session-1',
  checkin_id: 'checkin-1',
  challenge_id: 'challenge-1',
  activity_label: 'Outdoor Walking',
  vendor_workout_id: '3C8F0994-8BF8-45AB-A4B0-033EEF3339D9',
};

const CARD_SLOT = {
  method: 'hr',
  url: 'https://example.supabase.co/storage/v1/object/sign/challenge-proofs/hr_monitor-1.jpg',
  healthWorkoutId: '7bf86cb2-e26d-467f-9b3b-44bc4a0808e5',
  health: WALK,
};

describe('rebuilding the workout a stored card was drawn from', () => {
  it('recovers the distance the old card could not show', () => {
    const workout = workoutFromStoredSession(WALK, SESSION);
    expect(workout?.distanceM).toBe(10042);
  });

  it('redraws as 6.24 mi where the card on the post says 0.00 mi', () => {
    const workout = workoutFromStoredSession(WALK, SESSION);
    const card = buildWorkoutProofCard({
      workout: workout!,
      samples: [],
      timeZone: 'America/Denver',
      challengeTitle: '30-Day Consistency',
    });
    expect(card.distanceLine).toBe('6.24 mi');
    expect(card.headline).toEqual({ value: '6.24 mi', label: 'Distance' });
  });

  it('keeps the rest of what the card prints', () => {
    const workout = workoutFromStoredSession(WALK, SESSION);
    expect(workout).toMatchObject({
      activityLabel: 'Outdoor Walking',
      activityType: 'walking',
      durationSec: 8617,
      caloriesKcal: 672,
      hrAvg: 103,
      hrMax: 112,
      confidence: 'watch',
    });
  });

  it('falls back to the humanized type when no label was stored', () => {
    const workout = workoutFromStoredSession(WALK, { ...SESSION, activity_label: null });
    expect(workout?.activityLabel).toBe('Walking');
  });

  it('refuses a snapshot with no workout window, since the card prints one', () => {
    expect(workoutFromStoredSession({ ...WALK, startedAt: undefined })).toBeNull();
    expect(workoutFromStoredSession({ ...WALK, durationSec: undefined })).toBeNull();
  });

  it('never writes a zero distance or zero calories onto the card', () => {
    const workout = workoutFromStoredSession({
      ...WALK,
      distanceMeters: undefined,
      activeEnergyKcal: undefined,
    });
    expect(workout?.distanceM).toBeUndefined();
    expect(workout?.caloriesKcal).toBeUndefined();
  });
});

describe('reading the recorder back off the stored label', () => {
  it('maps the label the snapshot kept to the line the card prints', () => {
    expect(confidenceFromSourceName('Apple Watch')).toBe('watch');
    expect(confidenceFromSourceName('iPhone')).toBe('phone');
    expect(confidenceFromSourceName('Health')).toBe('unknown');
    expect(confidenceFromSourceName(null)).toBe('unknown');
  });
});

describe('which stored cards get redrawn', () => {
  const checkin = {
    id: 'checkin-1',
    challenge_id: 'challenge-1',
    proof_parts: { p_hr: CARD_SLOT, p_photo: { method: 'photo', url: 'https://example.com/a.jpg' } },
  };

  it('picks the slot holding the workout card, not the selfie beside it', () => {
    const work = redrawFor(SESSION, checkin);
    expect(work?.proofId).toBe('p_hr');
    expect(work?.healthWorkoutId).toBe('7bf86cb2-e26d-467f-9b3b-44bc4a0808e5');
    expect(work?.workout.distanceM).toBe(10042);
  });

  it('leaves a slot alone when no card was ever uploaded, rather than adding media', () => {
    const work = redrawFor(SESSION, {
      ...checkin,
      proof_parts: { p_hr: { ...CARD_SLOT, url: '' } },
    });
    expect(work).toBeNull();
  });

  it('ignores a screenshot read, which never had a generated card', () => {
    const work = redrawFor(SESSION, {
      ...checkin,
      proof_parts: { p_hr: { ...CARD_SLOT, health: { ...WALK, source: 'ocr' } } },
    });
    expect(work).toBeNull();
  });

  it('will not touch a check-in the session does not belong to', () => {
    expect(redrawFor(SESSION, { ...checkin, id: 'someone-else' })).toBeNull();
    expect(redrawFor({ ...SESSION, checkin_id: null }, checkin)).toBeNull();
  });
});

describe('not trading a wrong number for a missing graph', () => {
  it('waits when the workout had a heart rate but no samples came back', () => {
    const workout = workoutFromStoredSession(WALK, SESSION)!;
    expect(redrawWouldLoseHeartRate(workout, 0)).toBe(true);
    expect(redrawWouldLoseHeartRate(workout, 120)).toBe(false);
  });

  it('goes ahead for a workout that never had a heart rate to lose', () => {
    const workout = workoutFromStoredSession({ ...WALK, avgHrBpm: undefined }, SESSION)!;
    expect(redrawWouldLoseHeartRate(workout, 0)).toBe(false);
  });
});
