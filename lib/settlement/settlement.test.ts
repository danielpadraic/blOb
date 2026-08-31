import { describe, expect, it } from 'vitest';

import {
  FORFEIT_RECEIPT,
  assertsNoBucksWord,
  classifySettlementError,
  evenSplitShares,
  ILLEGAL_POINTS_EVEN_SPLIT_COPY,
  forfeitNotifyCopy,
  formatSettlementAmount,
  nobodyFinishedRuleCopy,
  isEvenSplitAutoSettle,
  isEvenSplitPayout,
  lifecycleLabel,
  lifecyclePhase,
  lobbyResultCopy,
  nonWinnerSettledNotifyCopy,
  payoutReceivedCopy,
  rankedShares,
  resultWhyCopy,
  splitSettledNotifyCopy,
  payoutSlices,
  receiptHeadline,
  remainingEligible,
  settlementVoidKind,
  settledCongratulateCopy,
  settlePayoutConfirmCopy,
  VOID_BOTH_RECEIPT,
  VOID_BUYIN_RECEIPT,
  VOID_HOST_RECEIPT,
  voidNotifyCopy,
  voidReceiptCopy,
  settlementErrorCopy,
  settlementRequiredDays,
  settlementRpcForPayout,
  shouldAutoSettle,
  walletAmountLabel,
  winnerSettledNotifyCopy,
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
    expect(
      shouldAutoSettle({
        status: 'ended',
        ends_at: '2020-01-01T00:00:00.000Z',
        challenge_type: 'points',
        prize_structure: 'winner_take_all',
      }),
    ).toBe(true);
    expect(
      isEvenSplitAutoSettle({
        prize_structure: 'winner_take_all',
        payout_mode: 'winner_take_all',
      }),
    ).toBe(true);
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
    expect(settlementRpcForPayout({ prize_structure: 'winner_take_all' })).toBe('settle_ended_challenge');
    expect(
      settlementRpcForPayout({
        challenge_type: 'points',
        prize_structure: 'top_places',
      }),
    ).toBe('settle_ended_challenge');
    expect(settlementRpcForPayout({ challenge_type: 'lms', is_unlimited: true })).toBe(
      'distribute_challenge',
    );
    expect(
      settlementRpcForPayout({
        challenge_type: 'points',
        prize_structure: 'winner_take_all',
      }),
    ).toBe('settle_ended_challenge');
    expect(
      settlementRpcForPayout({
        format: 'points',
        prize_structure: 'top_places',
      }),
    ).toBe('settle_ended_challenge');
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
      'Last standing takes the prize.',
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
    expect(evenSplitShares(100, 3, 'bucks')).toEqual([33.33, 33.33, 33.34]);
  });

  it('splits whole coins with leftover on the first winners', () => {
    expect(evenSplitShares(10, 3)).toEqual([4, 3, 3]);
    expect(evenSplitShares(10, 3).reduce((sum, share) => sum + share, 0)).toBe(10);
    expect(evenSplitShares(15, 7)).toEqual([3, 2, 2, 2, 2, 2, 2]);
    expect(evenSplitShares(35, 4)).toEqual([9, 9, 9, 8]);
    expect(evenSplitShares(1, 3)).toEqual([1, 0, 0]);
    expect(evenSplitShares(0, 2)).toEqual([]);
    expect(evenSplitShares(100, 3)).toEqual([34, 33, 33]);
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

  it('voids 0 winners with refund copy, and keeps old forfeit for empty historical rows', () => {
    expect(settlementVoidKind({ winnerCount: 0, payouts: [] })).toBe('historical_forfeit');
    expect(voidReceiptCopy('historical_forfeit')).toBe(FORFEIT_RECEIPT);
    expect(
      settlementVoidKind({
        winnerCount: 0,
        payouts: [{ reason: 'refund_buyin' }],
      }),
    ).toBe('buyin');
    expect(
      settlementVoidKind({
        winnerCount: 0,
        payouts: [{ reason: 'return_host_funding' }],
      }),
    ).toBe('host');
    expect(
      settlementVoidKind({
        winnerCount: 0,
        payouts: [{ reason: 'refund_buyin' }, { reason: 'return_host_funding' }],
      }),
    ).toBe('both');
    expect(voidReceiptCopy('buyin')).toBe(VOID_BUYIN_RECEIPT);
    expect(voidReceiptCopy('host')).toBe(VOID_HOST_RECEIPT);
    expect(voidReceiptCopy('both')).toBe(VOID_BOTH_RECEIPT);
    expect(voidNotifyCopy('Dawn Miles', 'host')).toBe(
      'Dawn Miles settled. Nobody finished. Prize returned to the host.',
    );
    expect(lobbyResultCopy({ title: 'Dawn Miles', remaining: 0, forfeited: false, voidKind: 'buyin' })).toBe(
      'Dawn Miles settled. Nobody finished. Entry coins were returned.',
    );
    expect(nobodyFinishedRuleCopy({ buyInAmount: 10 })).toBe(
      'If nobody finishes, entry coins are returned.',
    );
    expect(nobodyFinishedRuleCopy({ hostFunded: true, hostBudget: 25 })).toBe(
      'If nobody finishes, the prize is returned to the host.',
    );
    expect(receiptHeadline({ joined: true, winnerCount: 0, voidKind: 'buyin' })).toBe(VOID_BUYIN_RECEIPT);
    expect(receiptHeadline({ joined: true, winnerCount: 0 })).toBe(FORFEIT_RECEIPT);
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
    expect(winnerSettledNotifyCopy('Daily Prayer', walletAmountLabel(25, 'coins'))).toBe(
      'Daily Prayer settled. 25 coins is in your wallet.',
    );
    expect(winnerSettledNotifyCopy('Daily Prayer', walletAmountLabel(10, 'bucks'))).toBe(
      'Daily Prayer settled. $10.00 is in your wallet.',
    );
    expect(nonWinnerSettledNotifyCopy('Daily Prayer', 'Sam')).toBe('Daily Prayer settled. Sam took it.');
    expect(splitSettledNotifyCopy('Daily Prayer', 2)).toBe('Daily Prayer settled. You split it with 2.');
    expect(assertsNoBucksWord(winnerSettledNotifyCopy('Daily Prayer', walletAmountLabel(10, 'bucks')))).toBe(
      true,
    );
  });
});

describe('ranked shares', () => {
  const board = [
    { user_id: 'a', score: 5, status: 'joined' },
    { user_id: 'b', score: 3, status: 'joined' },
    { user_id: 'c', score: 1, status: 'joined' },
    { user_id: 'd', score: 9, status: 'eliminated' },
  ];

  it('pays winner take all to the highest score', () => {
    const paid = rankedShares({
      pool: 100,
      family: 'points',
      challenge_type: 'points',
      prize_structure: 'winner_take_all',
      payout_mode: 'winner_take_all',
      rows: board,
    });
    expect(paid).toEqual([
      { user_id: 'a', amount: 100, place: 1, score: 5, reason: 'distribute_win' },
    ]);
    expect(resultWhyCopy({ family: 'points', prize_structure: 'winner_take_all' })).toBe(
      'Highest points. Tie split.',
    );
  });

  it('splits a first-place tie among tied firsts only', () => {
    const paid = rankedShares({
      pool: 100,
      family: 'points',
      challenge_type: 'points',
      prize_structure: 'winner_take_all',
      payout_mode: 'winner_take_all',
      rows: [
        { user_id: 'a', score: 4, status: 'joined' },
        { user_id: 'b', score: 4, status: 'joined' },
        { user_id: 'c', score: 2, status: 'joined' },
      ],
    });
    expect(paid.map((row) => row.user_id).sort()).toEqual(['a', 'b']);
    expect(paid.every((row) => row.amount === 50)).toBe(true);
    expect(paid.every((row) => row.place === 1)).toBe(true);
  });

  it('even-splits top 3 and lets a tie straddle the cut', () => {
    const paid = rankedShares({
      pool: 90,
      family: 'points',
      challenge_type: 'points',
      prize_structure: 'top_places',
      payout_mode: 'top_places',
      top_places_mode: 'count',
      top_places_value: 3,
      top_places_distribution: 'even',
      rows: [
        { user_id: 'a', score: 10, status: 'joined' },
        { user_id: 'b', score: 8, status: 'joined' },
        { user_id: 'c', score: 6, status: 'joined' },
        { user_id: 'd', score: 6, status: 'joined' },
        { user_id: 'e', score: 1, status: 'joined' },
      ],
    });
    expect(paid.map((row) => row.user_id).sort()).toEqual(['a', 'b', 'c', 'd']);
    expect(paid.reduce((sum, row) => sum + row.amount, 0)).toBe(90);
  });

  it('takes top 25 percent, at least one if anyone scored', () => {
    const paid = rankedShares({
      pool: 40,
      family: 'points',
      challenge_type: 'points',
      prize_structure: 'top_places',
      payout_mode: 'top_places',
      top_places_mode: 'percent',
      top_places_value: 25,
      top_places_distribution: 'even',
      rows: [
        { user_id: 'a', score: 8, status: 'joined' },
        { user_id: 'b', score: 4, status: 'joined' },
        { user_id: 'c', score: 2, status: 'joined' },
        { user_id: 'd', score: 1, status: 'joined' },
      ],
    });
    expect(paid).toHaveLength(1);
    expect(paid[0]?.user_id).toBe('a');
    expect(paid[0]?.amount).toBe(40);
  });

  it('scales three places with N, N-1, … 1 weights', () => {
    const paid = rankedShares({
      pool: 60,
      family: 'points',
      challenge_type: 'points',
      prize_structure: 'top_places',
      payout_mode: 'top_places',
      top_places_mode: 'count',
      top_places_value: 3,
      top_places_distribution: 'scaled',
      rows: [
        { user_id: 'a', score: 9, status: 'joined' },
        { user_id: 'b', score: 6, status: 'joined' },
        { user_id: 'c', score: 3, status: 'joined' },
      ],
    });
    expect(paid.map((row) => row.amount)).toEqual([30, 20, 10]);
    expect(paid.reduce((sum, row) => sum + row.amount, 0)).toBe(60);
  });

  it('gives leftover coins to the highest place first', () => {
    const paid = rankedShares({
      pool: 10,
      family: 'points',
      challenge_type: 'points',
      prize_structure: 'winner_take_all',
      payout_mode: 'winner_take_all',
      rows: [
        { user_id: 'a', score: 2, status: 'joined' },
        { user_id: 'b', score: 2, status: 'joined' },
        { user_id: 'c', score: 2, status: 'joined' },
      ],
    });
    expect(paid.map((row) => row.amount).sort((a, b) => b - a)).toEqual([4, 3, 3]);
    expect(paid.reduce((sum, row) => sum + row.amount, 0)).toBe(10);
  });

  it('forfeits when nobody is eligible', () => {
    expect(
      rankedShares({
        pool: 50,
        family: 'points',
        challenge_type: 'points',
        prize_structure: 'winner_take_all',
        payout_mode: 'winner_take_all',
        rows: [
          { user_id: 'a', score: 4, status: 'eliminated' },
          { user_id: 'b', score: 0, status: 'withdrawn' },
        ],
      }),
    ).toEqual([]);
  });

  it('rejects an illegal points even-split pair', () => {
    expect(() =>
      rankedShares({
        pool: 50,
        family: 'points',
        challenge_type: 'points',
        prize_structure: 'equal_split',
        payout_mode: 'even_split_remaining',
        rows: [{ user_id: 'a', score: 2, status: 'joined' }],
      }),
    ).toThrow(ILLEGAL_POINTS_EVEN_SPLIT_COPY);
  });

  it('keeps consistency even-split and last-standing on their own rules', () => {
    const remaining = remainingEligible(
      [
        { user_id: 'a', days_completed: 7, status: 'joined' },
        { user_id: 'b', days_completed: 7, status: 'joined' },
        { user_id: 'c', days_completed: 2, status: 'joined' },
      ],
      7,
    );
    expect(remaining.map((row) => row.user_id)).toEqual(['a', 'b']);
    expect(evenSplitShares(40, remaining.length)).toEqual([20, 20]);
    const last = rankedShares({
      pool: 40,
      family: 'consistency',
      challenge_type: 'consistency',
      prize_structure: 'winner_take_all',
      payout_mode: 'winner_take_all',
      rows: [
        { user_id: 'a', score: 7, status: 'joined' },
        { user_id: 'b', score: 4, status: 'eliminated' },
      ],
    });
    expect(last).toEqual([
      { user_id: 'a', amount: 40, place: 1, score: 7, reason: 'distribute_win' },
    ]);
    expect(resultWhyCopy({ family: 'consistency', prize_structure: 'equal_split' })).toBe(
      'Everyone still in split.',
    );
    expect(resultWhyCopy({ family: 'consistency', prize_structure: 'winner_take_all' })).toBe(
      'Last standing.',
    );
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
