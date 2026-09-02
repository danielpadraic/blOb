import { describe, expect, it } from 'vitest';

import { isCumulativeDraft } from '@/lib/challengeTemplates';
import {
  SIMPLE_SCORING,
  canRoundTripToSimple,
  createValuesToSimpleDraft,
  defaultSimpleDraft,
  isLeftoverSimplePointsDraft,
  parseSimpleChallengeDraft,
  simpleDraftFromChallenge,
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
    expect(values.prize_structure).toBe('equal_split');
    expect(values.payout_mode).toBe('even_split_remaining');
  });

  it('publishes 128 miles and Top # 3 from Simple Cumulative', () => {
    const draft = defaultSimpleDraft();
    draft.title = '128 miler';
    draft.scoring = 'cumulative';
    draft.metrics = [{ id: 'm1', target: 128, name: 'miles', unit: 'mi' }];
    draft.payout = 'top_count';
    draft.top_places_value = 3;
    const values = simpleDraftToCreateValues(draft);
    expect(values.metrics).toEqual([
      expect.objectContaining({ target: 128, name: 'miles', unit: 'mi' }),
    ]);
    expect(Number(values.cumulative_target)).toBe(128);
    expect(values.payout_mode).toBe('top_places');
    expect(values.prize_structure).toBe('top_places');
    expect(values.top_places_value).toBe('3');
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

  it('writes the duration integer onto days, length, check-ins, and target', () => {
    const draft = defaultSimpleDraft();
    draft.title = 'Thirty';
    draft.duration_preset = 30;
    draft.duration_days = 30;
    const values = simpleDraftToCreateValues(draft);
    expect(values.duration_days).toBe('30');
    expect(values.duration_value).toBe('30');
    expect(values.required_checkins).toBe('30');
    expect(values.target_count).toBe('30');
  });

  it('resets leftover Last standing to anyone-to when Simple is Cumulative', () => {
    const draft = defaultSimpleDraft();
    draft.title = 'Hit 100';
    draft.scoring = 'cumulative';
    draft.payout = 'winner_take_all';
    const values = simpleDraftToCreateValues(draft);
    expect(values.payout_mode).toBe('even_split_remaining');
    expect(values.prize_structure).toBe('equal_split');
  });
});

describe('Simple allowed misses', () => {
  it('publishes allowed_misses onto the existing misses_allowed field', () => {
    const draft = defaultSimpleDraft();
    draft.title = '30-Day Consistency';
    draft.duration_preset = 30;
    draft.duration_days = 30;
    draft.scoring = 'consistency';
    draft.allowed_misses = 6;
    const values = simpleDraftToCreateValues(draft);
    expect(values.misses_allowed).toBe('6');
    const again = parseSimpleChallengeDraft({ ...draft, allowed_misses: 6 });
    expect(again?.allowed_misses).toBe(6);
    expect(createValuesToSimpleDraft(values).allowed_misses).toBe(6);
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

  it('loads saved duration_days even when ends_at is still a 6-day window', () => {
    const draft = simpleDraftFromChallenge({
      id: 'c1',
      title: '30-Day Consistency',
      days_required: 30,
      length_value: 30,
      length_unit: 'days',
      starts_at: '2026-08-01T09:00:00.000Z',
      ends_at: '2026-08-07T09:00:00.000Z',
      task: 'Show up',
      frequency: 'daily',
      is_unlimited: false,
    } as never);
    expect(draft.duration_days).toBe(30);
    expect(draft.duration_preset).toBe(30);
    const values = simpleDraftToCreateValues({ ...draft, title: '30-Day Consistency' });
    expect(values.duration_days).toBe('30');
    expect(values.duration_value).toBe('30');
  });

  it('blocks Advanced-only challenges from Simple', () => {
    expect(canRoundTripToSimple({ challenge_type: 'points' })).toBe(false);
    expect(canRoundTripToSimple({ extra_rules: [{ text: 'No bikes' }] })).toBe(false);
    expect(canRoundTripToSimple({ challenge_lane: 'private' })).toBe(false);
  });
});
