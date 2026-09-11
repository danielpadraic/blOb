import { describe, expect, it } from 'vitest';

import {
  defaultPayoutIdForFamily,
  defaultPayoutPairForFamily,
  formatFamilyOf,
  isIllegalFormatPayoutPair,
  pairFromPayoutControl,
  payoutControlFromPair,
  payoutOptionsForFamily,
} from '@/lib/formatPayout';

describe('format × payout pairing', () => {
  it('defaults Consistency to even split remaining and hides top places', () => {
    expect(defaultPayoutIdForFamily('consistency')).toBe('even_split_remaining');
    expect(payoutOptionsForFamily('consistency').map((item) => item.id)).toEqual([
      'even_split_remaining',
      'last_standing',
    ]);
    expect(defaultPayoutPairForFamily('consistency')).toMatchObject({
      prize_structure: 'equal_split',
      payout_mode: 'even_split_remaining',
    });
  });

  it('defaults Points to winner take all and hides even-split remaining', () => {
    expect(formatFamilyOf({ challenge_type: 'points' })).toBe('points');
    expect(defaultPayoutIdForFamily('points')).toBe('winner_take_all');
    expect(payoutOptionsForFamily('points').some((item) => item.id === 'even_split_remaining')).toBe(
      false,
    );
    expect(defaultPayoutPairForFamily('points')).toMatchObject({
      prize_structure: 'winner_take_all',
      payout_mode: 'winner_take_all',
    });
  });

  it('defaults Cumulative to winner take all and allows Top # / Top % / Scaled', () => {
    expect(formatFamilyOf({ challenge_type: 'cumulative' })).toBe('cumulative');
    expect(defaultPayoutIdForFamily('cumulative')).toBe('winner_take_all');
    expect(payoutOptionsForFamily('cumulative').map((item) => item.label)).toEqual([
      'Winner take all',
      'Top #',
      'Top %',
      'Scaled among those places',
      'Anyone who hits the goal',
    ]);
    expect(payoutOptionsForFamily('cumulative').map((item) => item.id)).toEqual([
      'winner_take_all',
      'top_count',
      'top_percent',
      'scaled',
      'even_split_remaining',
    ]);
    expect(defaultPayoutPairForFamily('cumulative')).toMatchObject({
      prize_structure: 'winner_take_all',
      payout_mode: 'winner_take_all',
    });
    expect(
      payoutControlFromPair('cumulative', {
        prize_structure: 'top_places',
        payout_mode: 'top_places',
        top_places_mode: 'count',
      }),
    ).toBe('top_count');
  });

  it('resets Top 3 when switching to Consistency', () => {
    const leftover = pairFromPayoutControl('top_count');
    expect(leftover.prize_structure).toBe('top_places');
    expect(defaultPayoutPairForFamily('consistency').prize_structure).toBe('equal_split');
  });

  it('reads an old WTA consistency row as Last standing without rewriting it to top places', () => {
    expect(
      payoutControlFromPair('consistency', {
        prize_structure: 'winner_take_all',
        payout_mode: 'winner_take_all',
      }),
    ).toBe('last_standing');
    expect(
      isIllegalFormatPayoutPair({
        format: 'consistency',
        prize_structure: 'winner_take_all',
        payout_mode: 'winner_take_all',
      }),
    ).toBe(false);
  });

  it('rejects consistency + top places and points + even split; Cumulative may use WTA', () => {
    expect(
      isIllegalFormatPayoutPair({
        format: 'consistency',
        prize_structure: 'top_places',
        payout_mode: 'top_places',
      }),
    ).toBe(true);
    expect(
      isIllegalFormatPayoutPair({
        format: 'points',
        prize_structure: 'equal_split',
        payout_mode: 'even_split_remaining',
      }),
    ).toBe(true);
    expect(
      isIllegalFormatPayoutPair({
        format: 'cumulative',
        prize_structure: 'winner_take_all',
        payout_mode: 'winner_take_all',
      }),
    ).toBe(false);
    expect(
      isIllegalFormatPayoutPair({
        format: 'cumulative',
        prize_structure: 'equal_split',
        payout_mode: 'even_split_remaining',
      }),
    ).toBe(false);
  });
});
