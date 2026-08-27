import { describe, expect, it } from 'vitest';

import { isCumulativeDraft } from '@/lib/challengeTemplates';
import {
  SIMPLE_SCORING,
  defaultSimpleDraft,
  isLeftoverSimplePointsDraft,
  simpleDraftToCreateValues,
  simpleHowYouWin,
} from '@/lib/simpleChallenge';

describe('Simple How you win', () => {
  it('offers Consistency and Cumulative only', () => {
    expect(SIMPLE_SCORING.map((item) => item.value)).toEqual(['consistency', 'cumulative']);
    expect(SIMPLE_SCORING.some((item) => item.value === 'points')).toBe(false);
  });

  it('publishes Running Consistency as even-split remaining', () => {
    const draft = defaultSimpleDraft();
    draft.type = 'running';
    draft.title = 'Morning miles';
    draft.scoring = 'consistency';
    const values = simpleDraftToCreateValues(draft);
    expect(values.challenge_type).toBe('consistency');
    expect(values.format).toBe('consistency');
    expect(values.prize_structure).toBe('equal_split');
    expect(values.payout_mode).toBe('even_split_remaining');
  });

  it('publishes Cumulative as cumulative, not points', () => {
    const draft = defaultSimpleDraft();
    draft.title = 'Hit 100';
    draft.scoring = 'cumulative';
    const values = simpleDraftToCreateValues(draft);
    expect(isCumulativeDraft(values)).toBe(true);
    expect(values.challenge_type).toBe('cumulative');
    expect(values.format).toBe('cumulative');
    expect(values.challenge_type).not.toBe('points');
  });

  it('does not publish a leftover Simple Points draft as a points board', () => {
    const draft = defaultSimpleDraft();
    draft.title = 'Old points chip';
    draft.scoring = 'points';
    draft.points_to_win = 12;
    expect(isLeftoverSimplePointsDraft(draft)).toBe(true);
    expect(simpleHowYouWin(draft)).toBe('consistency');
    const values = simpleDraftToCreateValues(draft);
    expect(values.challenge_type).toBe('consistency');
    expect(values.format).toBe('consistency');
    expect(values.points_to_win).toBe('');
    expect(values.prize_structure).toBe('equal_split');
  });
});
