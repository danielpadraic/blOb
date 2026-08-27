import { describe, expect, it } from 'vitest';

import { isCumulativeDraft } from '@/lib/challengeTemplates';
import { cumulativeEligible, cumulativeProgressCopy } from '@/lib/cumulative';
import { milesToMeters } from '@/lib/distance';
import { defaultSimpleDraft, simpleDraftToCreateValues } from '@/lib/simpleChallenge';

describe('Cumulative scoring', () => {
  it('round-trips Simple Cumulative target, window, and Distance miles', () => {
    const draft = defaultSimpleDraft();
    draft.scoring = 'cumulative';
    draft.cumulative_target_meters = milesToMeters(100);
    draft.cumulative_window = 'challenge';
    draft.distance_unit = 'mi';
    draft.proofs = [
      {
        id: 'd1',
        name: 'Attach a run or walk of at least 1.00 miles.',
        method: 'distance',
        distance_meters: milesToMeters(1),
      },
    ];
    const values = simpleDraftToCreateValues(draft);
    expect(isCumulativeDraft(values)).toBe(true);
    expect(values.challenge_type).toBe('cumulative');
    expect(values.format).toBe('cumulative');
    expect(Number(values.cumulative_target)).toBe(milesToMeters(100));
    expect(values.cumulative_window).toBe('challenge');
    expect(values.challenge_proofs?.some((proof) => proof.method === 'distance')).toBe(true);
  });

  it('treats 40 + 60 miles as eligible at 100 / 100', () => {
    const done = milesToMeters(40) + milesToMeters(60);
    const target = milesToMeters(100);
    expect(cumulativeEligible(done, target)).toBe(true);
    expect(cumulativeProgressCopy(done, target, 'mi')).toMatch(/100/);
  });
});
