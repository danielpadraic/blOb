import { describe, expect, it } from 'vitest';

import {
  FORFEIT_RECEIPT,
  assertsNoBucksWord,
  classifySettlementError,
  evenSplitShares,
  forfeitNotifyCopy,
  formatSettlementAmount,
  isEvenSplitAutoSettle,
  isEvenSplitPayout,
  lifecycleLabel,
  lifecyclePhase,
  lobbyResultCopy,
  payoutReceivedCopy,
  payoutSlices,
  receiptHeadline,
  remainingEligible,
  settledCongratulateCopy,
  settlePayoutConfirmCopy,
  settlementErrorCopy,
  settlementRequiredDays,
  settlementRpcForPayout,
  shouldAutoSettle,
} from '@/lib/settlement/index';

describe('lifecycle', () => {
  it('maps Open → Live → Settling → Settled', () => {
    expect(lifecyclePhase('open')).toBe('open');
    expect(lifecyclePhase('filling')).toBe('open');
    expect(lifecyclePhase('live')).toBe('live');
    expect(lifecyclePhase('ended')).toBe('settling');
    expect(lifecyclePhase('settling')).toBe('settling');
    expect(lifecyclePhase('judging')).toBe('settling');
    expect(lifecyclePhase('settled')).toBe('settled');
    expect(lifecycleLabel('distributing')).toBe('Settling');
  });

  it('auto-settles even-split after the clock, never LMS', () => {
    expect(
      shouldAutoSettle({
        status: 'live',
        ends_at: '2020-01-01T00:00:00.000Z',
        prize_structure: 'equal_split',
      }),
    ).toBe(true);
    expect(isEvenSplitAutoSettle({ challenge_type: 'lms' })).toBe(false);
    expect(isEvenSplitAutoSettle({ is_unlimited: true })).toBe(false);
  });

  it('routes host Settle to the payout RPC the host picked', () => {
    expect(
      settlementRpcForPayout({
        prize_structure: 'equal_split',
        payout_mode: 'even_split_remaining',
      }),
    ).toBe('settle_ended_challenge');
    expect(
      settlementRpcForPayout({
        challenge_type: 'cumulative',
        prize_structure: 'equal_split',
        payout_mode: 'even_split_remaining',
      }),
    ).toBe('settle_ended_challenge');
    expect(isEvenSplitPayout({ prize_structure: 'winner_take_all' })).toBe(false);
    expect(settlementRpcForPayout({ prize_structure: 'winner_take_all' })).toBe('distribute_challenge');
    expect(settlementRpcForPayout({ prize_structure: 'top_places' })).toBe('distribute_challenge');
    expect(
      settlementRpcForPayout({
        challenge_type: 'points',
        prize_structure: 'winner_take_all',
      }),
    ).toBe('distribute_challenge');
    expect(
      settlementRpcForPayout({
        challenge_type: 'points',
        prize_structure: 'equal_split',
        payout_mode: 'even_split_remaining',
      }),
    ).toBe('settle_ended_challenge');
  });

  it('writes confirm copy for each payout path', () => {
    expect(settlePayoutConfirmCopy({ prize_structure: 'equal_split' })).toBe(
      'Everyone still in splits the prize.',
    );
    expect(settlePayoutConfirmCopy({ prize_structure: 'winner_take_all' })).toBe(
      'First place takes the prize.',
    );
    expect(
      settlePayoutConfirmCopy({
        challenge_type: 'points',
        prize_structure: 'winner_take_all',
      }),
    ).toBe('Highest points wins. Ties split.');
    expect(
      settlePayoutConfirmCopy({
        prize_structure: 'top_places',
        top_places_mode: 'count',
        top_places_value: 3,
        top_places_distribution: 'even',
      }),
    ).toBe('The top 3 finishers will split the prize evenly.');
  });
});

describe('even-split remaining', () => {
  it('pays 2+ remaining correctly and writes even shares', () => {
    const required = settlementRequiredDays({ days_required: 7, target_count: 7 });
    const remaining = remainingEligible(
      [
        { user_id: 'a', days_completed: 7, status: 'joined' },
        { user_id: 'b', days_completed: 7, status: 'active' },
        { user_id: 'c', days_completed: 2, status: 'joined' },
        { user_id: 'd', days_completed: 7, status: 'eliminated', eliminated_at: '2026-01-01' },
      ],
      required,
    );
    expect(remaining.map((row) => row.user_id)).toEqual(['a', 'b']);
    expect(evenSplitShares(100, remaining.length)).toEqual([50, 50]);
    expect(payoutSlices(['a', 'b'], 10)).toEqual([
      { user_id: 'a', amount: 5, place: 1, reason: 'distribute_win' },
      { user_id: 'b', amount: 5, place: 1, reason: 'distribute_win' },
    ]);
    expect(evenSplitShares(100, 3)).toEqual([33.33, 33.33, 33.34]);
  });

  it('forfeits cleanly when nobody remaining', () => {
    const remaining = remainingEligible(
      [
        { user_id: 'a', days_completed: 1, status: 'joined' },
        { user_id: 'b', days_completed: 0, status: 'withdrawn' },
      ],
      7,
    );
    expect(remaining).toEqual([]);
    expect(evenSplitShares(50, remaining.length)).toEqual([]);
    expect(receiptHeadline({ joined: true, winnerCount: 0 })).toBe(FORFEIT_RECEIPT);
    expect(forfeitNotifyCopy('Rookies vs. Rockstars')).toBe(
      'Rookies vs. Rockstars settled. Nobody remaining. Prize forfeited.',
    );
    expect(lobbyResultCopy({ title: 'Rookies vs. Rockstars', remaining: 0, forfeited: true })).toContain(
      'Prize forfeited',
    );
  });
});

describe('copy', () => {
  it('matches check-in pronoun style and never says Bucks', () => {
    const line = settledCongratulateCopy({
      displayName: 'Sam',
      title: 'Official Weekly',
      objectPronoun: 'them',
    });
    expect(line).toBe('Sam Settled @Official Weekly. Congratulate them.');
    expect(payoutReceivedCopy('$10.00', 'Official Weekly')).toBe(
      'You received $10.00 from @Official Weekly.',
    );
    expect(formatSettlementAmount(10, 'bucks')).toBe('$10.00');
    expect(formatSettlementAmount(25, 'coins')).toBe('25');
    expect(assertsNoBucksWord(line)).toBe(true);
    expect(assertsNoBucksWord(FORFEIT_RECEIPT)).toBe(true);
    expect(assertsNoBucksWord(formatSettlementAmount(5, 'bucks'))).toBe(true);
  });
});

describe('errors', () => {
  it('classifies recoverable settlement failures', () => {
    expect(classifySettlementError(new Error('ALREADY_SETTLED'))).toBe('already_settled');
    expect(classifySettlementError(new Error('23505 unique_violation'))).toBe('race');
    expect(classifySettlementError(new Error('INSUFFICIENT_FLOAT'))).toBe('insufficient_float');
    expect(classifySettlementError(new Error('geo restricted'))).toBe('geo_restricted');
    expect(classifySettlementError(new Error('CHALLENGE_NOT_ENDED'))).toBe('not_ended');
    expect(classifySettlementError(new Error('NOT_EVEN_SPLIT'))).toBe('not_even_split');
    expect(classifySettlementError(new Error('Failed to fetch'))).toBe('offline');
  });

  it('uses the server reason instead of a generic settle fail', () => {
    expect(settlementErrorCopy(new Error('NOT_EVEN_SPLIT'))).toBe(
      'This prize is ranked, not an even split. Host Settle pays first place or top places.',
    );
    expect(settlementErrorCopy(new Error('COOLDOWN_ACTIVE'))).toBe(
      'Payout unlocks 1 hour after the challenge ends.',
    );
    expect(settlementErrorCopy(new Error('Only the host can close or pay out.'))).toBe(
      'Only the host can close or pay out.',
    );
    expect(settlementErrorCopy(new Error('NOT_EVEN_SPLIT'))).not.toMatch(/Couldn.t settle/i);
  });
});
