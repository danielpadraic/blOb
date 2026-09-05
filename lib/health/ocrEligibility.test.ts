import { describe, expect, it } from 'vitest';

import { isOcrEligibleProof, shouldReadWorkoutStill } from '@/lib/health/ocrSession';

describe('which slots get read', () => {
  it('reads heart-rate and distance slots', () => {
    expect(isOcrEligibleProof({ method: 'hr' })).toBe(true);
    expect(isOcrEligibleProof({ method: 'distance' })).toBe(true);
  });

  it('never reads selfies, notes, honor or location slots', () => {
    expect(isOcrEligibleProof({ method: 'photo' })).toBe(false);
    expect(isOcrEligibleProof({ method: 'video' })).toBe(false);
    expect(isOcrEligibleProof({ method: 'checkin' })).toBe(false);
    expect(isOcrEligibleProof({ method: 'honor' })).toBe(false);
    expect(isOcrEligibleProof({ method: 'location' })).toBe(false);
  });
});

describe('which stills get read', () => {
  const hr = { method: 'hr' } as const;

  it('reads a local screenshot on a tracker slot', () => {
    expect(shouldReadWorkoutStill({ proof: hr, uri: 'file:///tmp/shot.jpg' })).toBe(true);
  });

  it('skips a slot with no still yet', () => {
    expect(shouldReadWorkoutStill({ proof: hr, uri: '' })).toBe(false);
  });

  it('skips the health: placeholder and a card still rasterizing', () => {
    expect(shouldReadWorkoutStill({ proof: hr, uri: 'health:123' })).toBe(false);
    expect(shouldReadWorkoutStill({ proof: hr, uri: 'file:///a.jpg', building: true })).toBe(false);
  });

  it('skips video', () => {
    expect(shouldReadWorkoutStill({ proof: hr, uri: 'file:///a.mov', mimeType: 'video/quicktime' })).toBe(
      false,
    );
  });

  it('skips our own generated workout card', () => {
    expect(shouldReadWorkoutStill({ proof: hr, uri: 'file:///card.jpg', healthWorkoutId: 'w1' })).toBe(false);
  });

  it('never overwrites a vendor attach with a guess', () => {
    const health = {
      source: 'healthkit' as const,
      activityType: 'strength',
      sourceName: 'Apple Watch',
      durationSec: 2470,
      startedAt: '2026-09-04T13:33:00.000Z',
      endedAt: '2026-09-04T14:14:00.000Z',
    };
    expect(shouldReadWorkoutStill({ proof: hr, uri: 'file:///card.jpg', health })).toBe(false);
    expect(
      shouldReadWorkoutStill({
        proof: hr,
        uri: 'file:///card.jpg',
        health: { ...health, source: 'health_connect' },
      }),
    ).toBe(false);
  });

  it('does read a still that already carries an ocr snapshot, so a retake re-reads', () => {
    expect(
      shouldReadWorkoutStill({
        proof: hr,
        uri: 'file:///new.jpg',
        health: {
          source: 'ocr',
          activityType: 'other',
          sourceName: 'Workout screenshot',
          durationSec: 1200,
        },
      }),
    ).toBe(true);
  });

  it('never reads a selfie slot even with a perfectly good still', () => {
    expect(shouldReadWorkoutStill({ proof: { method: 'photo' }, uri: 'file:///selfie.jpg' })).toBe(false);
  });
});
