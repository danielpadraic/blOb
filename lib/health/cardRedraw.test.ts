import { describe, expect, it } from 'vitest';

import {
  cardIsCurrent,
  cardRepairFor,
  confidenceFromSourceName,
  isVendorHealthProof,
  traceMissing,
  workoutFromStoredSession,
} from '@/lib/health/cardRedraw';
import { buildWorkoutProofCard, WORKOUT_CARD_VERSION } from '@/lib/health/workoutProofCard';

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

/**
 * Courtney's session from the day before. It predates the `source` field and its card never
 * rasterized, so the slot carries a Health receipt and an empty url.
 */
const LEGACY = {
  startedAt: '2026-09-04T13:25:43.056Z',
  endedAt: '2026-09-04T14:15:44.562Z',
  durationSec: 3002,
  activityType: 'other',
  sourceName: 'Apple Watch',
  avgHrBpm: 137,
  maxHrBpm: 174,
  activeEnergyKcal: 275,
};

const WORKOUT_ID = '7bf86cb2-e26d-467f-9b3b-44bc4a0808e5';
const LABELS = { [WORKOUT_ID]: 'Outdoor Walking' };

const CARD_SLOT = {
  method: 'hr',
  url: 'https://example.supabase.co/storage/v1/object/sign/challenge-proofs/hr_monitor-1.jpg',
  healthWorkoutId: WORKOUT_ID,
  health: WALK,
};

const CHECKIN = {
  id: 'checkin-1',
  challenge_id: 'challenge-1',
  proof_parts: { p_hr: CARD_SLOT, p_photo: { method: 'photo', url: 'https://example.com/a.jpg' } },
};

describe('rebuilding the workout a stored card was drawn from', () => {
  it('recovers the distance the old card could not show', () => {
    expect(workoutFromStoredSession(WALK, 'Outdoor Walking', WORKOUT_ID)?.distanceM).toBe(10042);
  });

  it('draws as 6.24 mi where the card on the post says 0.00 mi', () => {
    const workout = workoutFromStoredSession(WALK, 'Outdoor Walking', WORKOUT_ID);
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
    expect(workoutFromStoredSession(WALK, 'Outdoor Walking', WORKOUT_ID)).toMatchObject({
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
    expect(workoutFromStoredSession(WALK, null, WORKOUT_ID)?.activityLabel).toBe('Walking');
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

  it('rebuilds a session that never carried a source field', () => {
    const workout = workoutFromStoredSession(LEGACY, null, 'df434ddb-730a-48ae-bf6e-31a5bda49da0');
    expect(workout).toMatchObject({ durationSec: 3002, hrAvg: 137, confidence: 'watch' });
    // No distance on that workout, so elapsed time is the achievement rather than a printed 0.00.
    const card = buildWorkoutProofCard({
      workout: workout!,
      samples: [],
      timeZone: 'America/Denver',
      challengeTitle: '30-Day Consistency',
    });
    expect(card.headline).toEqual({ value: '0:50:02', label: 'Workout time' });
    expect(card.distanceLine).toBeNull();
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

describe('telling a vendor session from a screenshot', () => {
  it('accepts what the watch recorded', () => {
    expect(isVendorHealthProof(WALK, { healthWorkoutId: WORKOUT_ID })).toBe(true);
  });

  it('accepts an early attach that predates the source field', () => {
    expect(isVendorHealthProof(LEGACY, { healthWorkoutId: 'df434ddb' })).toBe(true);
  });

  it('refuses numbers read off a screenshot or typed by hand', () => {
    expect(isVendorHealthProof({ ...WALK, source: 'ocr' }, { healthWorkoutId: WORKOUT_ID })).toBe(false);
    expect(isVendorHealthProof({ ...WALK, source: 'manual' }, { healthWorkoutId: WORKOUT_ID })).toBe(false);
  });

  it('refuses an unsourced snapshot with no vendor id behind it', () => {
    expect(isVendorHealthProof(LEGACY, { healthWorkoutId: null })).toBe(false);
    expect(isVendorHealthProof({ ...LEGACY, sourceName: undefined }, { healthWorkoutId: 'x' })).toBe(false);
  });
});

describe('which posted cards get drawn again', () => {
  it('picks the slot holding the workout card, not the selfie beside it', () => {
    const work = cardRepairFor(CHECKIN, LABELS);
    expect(work?.proofId).toBe('p_hr');
    expect(work?.healthWorkoutId).toBe(WORKOUT_ID);
    expect(work?.workout.distanceM).toBe(10042);
    expect(work?.workout.activityLabel).toBe('Outdoor Walking');
    expect(work?.hadCard).toBe(true);
  });

  // The whole point of the pass: a card the current renderer already drew is finished work.
  it('leaves a card alone once it carries the current stamp and its graph', () => {
    const work = cardRepairFor({
      ...CHECKIN,
      proof_parts: {
        p_hr: {
          ...CARD_SLOT,
          cardVersion: WORKOUT_CARD_VERSION,
          health: { ...WALK, hrSeries: [98, 104, 111] },
        },
      },
    });
    expect(work).toBeNull();
  });

  /**
   * The card the graph never reached. Stamping it current and walking away is what would leave it
   * graphless for good, since only this phone can read the series.
   */
  it('comes back for a current card whose heart-rate trace is still missing', () => {
    const work = cardRepairFor({
      ...CHECKIN,
      proof_parts: { p_hr: { ...CARD_SLOT, cardVersion: WORKOUT_CARD_VERSION } },
    });
    expect(work?.reason).toBe('trace');
    expect(work?.proofId).toBe('p_hr');
  });

  it('does not chase a trace for a workout that recorded no heart rate', () => {
    const work = cardRepairFor({
      ...CHECKIN,
      proof_parts: {
        p_hr: {
          ...CARD_SLOT,
          cardVersion: WORKOUT_CARD_VERSION,
          health: { ...WALK, avgHrBpm: undefined, maxHrBpm: undefined, minHrBpm: undefined },
        },
      },
    });
    expect(work).toBeNull();
  });

  it('calls a stale card stale, whether or not it has a trace', () => {
    expect(cardRepairFor(CHECKIN, LABELS)?.reason).toBe('renderer');
    expect(
      cardRepairFor({
        ...CHECKIN,
        proof_parts: { p_hr: { ...CARD_SLOT, health: { ...WALK, hrSeries: [98, 104] } } },
      })?.reason,
    ).toBe('renderer');
  });

  it('draws a stale card before one that is only chasing its graph', () => {
    const work = cardRepairFor({
      ...CHECKIN,
      proof_parts: {
        p_trace: { ...CARD_SLOT, cardVersion: WORKOUT_CARD_VERSION },
        p_stale: { ...CARD_SLOT, cardVersion: WORKOUT_CARD_VERSION - 1 },
      },
    });
    expect(work?.proofId).toBe('p_stale');
  });

  it('still picks up a card stamped by an older renderer', () => {
    const work = cardRepairFor({
      ...CHECKIN,
      proof_parts: { p_hr: { ...CARD_SLOT, cardVersion: WORKOUT_CARD_VERSION - 1 } },
    });
    expect(work?.proofId).toBe('p_hr');
  });

  // Courtney's check-in posted with two selfies and no recap, because the card never rasterized.
  it('gives a card to a Health attach that never got one', () => {
    const work = cardRepairFor({
      id: 'checkin-2',
      challenge_id: 'challenge-1',
      proof_parts: {
        p_hr: { method: 'hr', url: '', healthWorkoutId: 'df434ddb', health: LEGACY },
      },
    });
    expect(work?.proofId).toBe('p_hr');
    expect(work?.hadCard).toBe(false);
    expect(work?.workout.durationSec).toBe(3002);
  });

  it('ignores a screenshot read, which never had a generated card', () => {
    const work = cardRepairFor({
      ...CHECKIN,
      proof_parts: { p_hr: { ...CARD_SLOT, health: { ...WALK, source: 'ocr' } } },
    });
    expect(work).toBeNull();
  });

  it('ignores a check-in with no health proof at all', () => {
    const work = cardRepairFor({
      ...CHECKIN,
      proof_parts: { p_photo: { method: 'photo', url: 'https://example.com/a.jpg' } },
    });
    expect(work).toBeNull();
  });

  // Losing someone's words to a picture repair would be a strange trade.
  it('carries the slot caption through, since the save rebuilds the slot', () => {
    const work = cardRepairFor({
      ...CHECKIN,
      proof_parts: { p_hr: { ...CARD_SLOT, caption: 'Went for a walk with the cutie!' } },
    });
    expect(work?.caption).toBe('Went for a walk with the cutie!');
  });
});

describe('the stamp that stops the pass repeating itself', () => {
  it('treats an unstamped slot as stale, because the stamp came after those cards', () => {
    expect(cardIsCurrent({ cardVersion: null })).toBe(false);
    expect(cardIsCurrent({})).toBe(false);
  });

  it('treats the current generation, or a later one, as done', () => {
    expect(cardIsCurrent({ cardVersion: WORKOUT_CARD_VERSION })).toBe(true);
    expect(cardIsCurrent({ cardVersion: WORKOUT_CARD_VERSION + 1 })).toBe(true);
  });
});

describe('knowing which cards are still missing their graph', () => {
  it('is missing when the workout has a heart rate but no series', () => {
    expect(traceMissing(WALK)).toBe(true);
    expect(traceMissing(LEGACY)).toBe(true);
  });

  it('is satisfied once a series is stored', () => {
    expect(traceMissing({ ...WALK, hrSeries: [98, 104, 111] })).toBe(false);
  });

  it('is not missing on a workout that recorded no heart rate, which has none to find', () => {
    expect(traceMissing({ ...WALK, avgHrBpm: undefined, maxHrBpm: undefined })).toBe(false);
  });

  it('treats an empty series as no series, so the card is not left with a blank band', () => {
    expect(traceMissing({ ...WALK, hrSeries: [] })).toBe(true);
  });
});
