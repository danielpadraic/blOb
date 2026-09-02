import { describe, expect, it } from 'vitest';

import { isCumulativeDraft } from '@/lib/challengeTemplates';
import { challengeGoalLabel } from '@/lib/challengeGoal';
import {
  cumulativeEligible,
  cumulativeProgressCopy,
  cumulativeTargetMeters,
} from '@/lib/cumulative';
import { milesToMeters } from '@/lib/distance';
import { defaultSimpleDraft, simpleDraftToCreateValues } from '@/lib/simpleChallenge';

describe('Cumulative scoring', () => {
  it('round-trips Simple Cumulative target, window, and metric name', () => {
    const draft = defaultSimpleDraft();
    draft.scoring = 'cumulative';
    draft.metrics = [{ id: 'm1', target: 100, name: 'miles', unit: 'mi' }];
    draft.win_window = 'challenge';
    draft.cumulative_window = 'challenge';
    draft.distance_unit = 'mi';
    const values = simpleDraftToCreateValues(draft);
    expect(isCumulativeDraft(values)).toBe(true);
    expect(values.challenge_type).toBe('cumulative');
    expect(values.format).toBe('cumulative');
    expect(Number(values.cumulative_target)).toBe(100);
    expect(values.win_window).toBe('challenge');
    expect(values.metrics?.[0]).toMatchObject({ target: 100, name: 'miles', unit: 'mi' });
    expect(values.payout_mode).toBe('even_split_remaining');
  });

  it('reads the saved meter target, then the title if that column is 0', () => {
    expect(
      cumulativeTargetMeters({
        cumulative_target: milesToMeters(128),
        title: 'Run 128 Miles by January 1',
      }),
    ).toBe(milesToMeters(128));
    expect(
      cumulativeTargetMeters({
        cumulative_target: 0,
        title: 'Run 128 Miles by January 1',
      }),
    ).toBe(milesToMeters(128));
    expect(
      challengeGoalLabel(
        {
          challenge_type: 'cumulative',
          format: 'cumulative',
          cumulative_target: milesToMeters(128),
          title: 'Run 128 Miles by January 1',
        },
        { distanceMetersCompleted: 0, unit: 'mi' },
      ),
    ).toBe('0 / 128 mi');
    expect(
      challengeGoalLabel(
        {
          challenge_type: 'consistency',
          format: 'consistency',
          title: 'Run 1 mile every morning',
          days_required: 7,
          length_value: 7,
        },
        { daysCompleted: 0 },
      ),
    ).toBe('0 of 7 days');
  });

  it('treats 40 + 60 miles as eligible at 100 / 100', () => {
    const done = milesToMeters(40) + milesToMeters(60);
    const target = milesToMeters(100);
    expect(cumulativeEligible(done, target)).toBe(true);
    expect(cumulativeProgressCopy(done, target, 'mi')).toMatch(/100/);
  });
});
