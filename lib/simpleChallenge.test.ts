import { describe, expect, it } from 'vitest';

import { isCumulativeDraft } from '@/lib/challengeTemplates';
import {
  SIMPLE_SCORING,
  canRoundTripToSimple,
  createValuesToSimpleDraft,
  defaultSimpleDraft,
  isLeftoverSimplePointsDraft,
  parseSimpleChallengeDraft,
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

describe('Simple allowed misses', () => {
  it('publishes allowed_misses onto the existing misses_allowed field', () => {
    const draft = defaultSimpleDraft();
    draft.title = 'Miss three';
    draft.scoring = 'consistency';
    draft.allowed_misses = 3;
    const values = simpleDraftToCreateValues(draft);
    expect(values.misses_allowed).toBe('3');
    const again = parseSimpleChallengeDraft({ ...draft, allowed_misses: 3 });
    expect(again?.allowed_misses).toBe(3);
  });

  it('clears misses on cumulative publish', () => {
    const draft = defaultSimpleDraft();
    draft.title = 'Hit 100';
    draft.scoring = 'cumulative';
    draft.allowed_misses = 3;
    expect(simpleDraftToCreateValues(draft).misses_allowed).toBe('0');
  });

  it('round-trips Simple fields through Advanced values', () => {
    const draft = defaultSimpleDraft();
    draft.title = 'Workout Group #2';
    draft.task = 'Run 1 mile';
    draft.cover_image_url = 'https://example.com/cover.jpg';
    draft.host_budget = 25;
    draft.buy_in = 5;
    draft.allowed_misses = 3;
    draft.description = 'Show up';
    const values = simpleDraftToCreateValues(draft);
    const back = createValuesToSimpleDraft(values);
    expect(back.title).toBe('Workout Group #2');
    expect(back.task).toBe('Run 1 mile');
    expect(back.cover_image_url).toBe('https://example.com/cover.jpg');
    expect(back.host_budget).toBe(25);
    expect(back.allowed_misses).toBe(3);
    expect(canRoundTripToSimple(values)).toBe(true);
  });

  it('blocks Advanced-only challenges from Simple', () => {
    expect(canRoundTripToSimple({ challenge_type: 'points' })).toBe(false);
    expect(canRoundTripToSimple({ extra_rules: [{ text: 'No bikes' }] })).toBe(false);
    expect(canRoundTripToSimple({ challenge_lane: 'private' })).toBe(false);
  });
});
