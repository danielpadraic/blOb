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

  it('publishes Simple Points as a win total, not a weekly cadence', () => {
    const draft = defaultSimpleDraft();
    draft.scoring = 'points';
    draft.task = 'Bible reading';
    draft.frequency = 'daily';
    draft.custom_checkins = 20;
    draft.points_to_win = 12;
    const values = simpleDraftToCreateValues(draft);
    expect(values.challenge_type).toBe('points');
    expect(values.frequency).toBe('once');
    expect(values.points_to_win).toBe('12');
    expect(values.target_count).toBe('12');
    expect(values.required_checkins).toBe('1');
    expect(values.rules).toContain('Win by reaching 12 points');
    expect(values.rules).toContain('Bible reading');
    expect(values.rules).not.toMatch(/workout|every week|every day/i);
  });

  it('treats 40 + 60 miles as eligible at 100 / 100', () => {
    const done = milesToMeters(40) + milesToMeters(60);
    const target = milesToMeters(100);
    expect(cumulativeEligible(done, target)).toBe(true);
    expect(cumulativeProgressCopy(done, target, 'mi')).toMatch(/100/);
  });
});
