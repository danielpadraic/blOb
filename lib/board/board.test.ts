import { describe, expect, it } from 'vitest';

import { assertsNoBucksWord, boardEmptyCopy, boardSettledCopy, buildBoard } from '@/lib/board';
import { FORFEIT_RECEIPT } from '@/lib/settlement/receipts';

const roster = [
  { user_id: 'a', days_completed: 7, status: 'joined', display_name: 'Ada' },
  { user_id: 'b', days_completed: 7, status: 'active', display_name: 'Bea' },
  { user_id: 'c', days_completed: 2, status: 'eliminated', eliminated_at: '2026-01-01', display_name: 'Cam' },
  { user_id: 'd', days_completed: 0, status: 'refunded_pre_start', display_name: 'Dee' },
];

describe('live board buckets', () => {
  it('splits Remaining / Caught Up / Dropped from proven check-ins', () => {
    const view = buildBoard({
      status: 'live',
      prizePool: 20,
      participants: roster,
      completedUserIds: ['a'],
      viewerId: 'a',
      joined: true,
    });
    expect(view.remaining.map((row) => row.userId)).toEqual(['a', 'b']);
    expect(view.caughtUp.map((row) => row.userId)).toEqual(['a']);
    expect(view.dropped.map((row) => row.userId)).toEqual(['c']);
    expect(view.remainingCount).toBe(2);
    expect(view.caughtUpCount).toBe(1);
    expect(view.droppedCount).toBe(1);
    expect(view.shareEstimate).toBe(10);
    expect(view.settled).toBe(false);
  });
});

describe('settled board', () => {
  it('keeps 2+ remaining as paid and leaves a receipt path', () => {
    const view = buildBoard({
      status: 'settled',
      prizePool: 0,
      participants: roster,
      settlement: {
        winner_count: 2,
        prize_pool: 20,
        payouts: [
          { user_id: 'a', amount: 10 },
          { user_id: 'b', amount: 10 },
        ],
      },
      viewerId: 'a',
      joined: true,
    });
    expect(view.settled).toBe(true);
    expect(view.forfeited).toBe(false);
    expect(view.remaining.map((row) => row.userId)).toEqual(['a', 'b']);
    expect(view.dropped.map((row) => row.userId)).toEqual(['c']);
    expect(view.youPaid).toBe(true);
    expect(view.yourPayout).toBe(10);
    const copy = boardSettledCopy(view);
    expect(copy.showBob).toBe(true);
    expect(assertsNoBucksWord(copy.body)).toBe(true);
  });

  it('forfeits 0 remaining in plain language with no Bob', () => {
    const view = buildBoard({
      status: 'settled',
      prizePool: 50,
      participants: roster,
      settlement: { winner_count: 0, prize_pool: 50, payouts: [] },
      viewerId: 'a',
      joined: true,
    });
    expect(view.forfeited).toBe(true);
    expect(view.remainingCount).toBe(0);
    expect(view.dropped.map((row) => row.userId).sort()).toEqual(['a', 'b', 'c']);
    const copy = boardSettledCopy(view);
    expect(copy.showBob).toBe(false);
    expect(copy.body).toBe(FORFEIT_RECEIPT);
    expect(assertsNoBucksWord(copy.body)).toBe(true);
  });

  it('lets a spectator see the settled board without a personal payout', () => {
    const view = buildBoard({
      status: 'settled',
      participants: roster,
      settlement: {
        winner_count: 2,
        prize_pool: 20,
        payouts: [
          { user_id: 'a', amount: 10 },
          { user_id: 'b', amount: 10 },
        ],
      },
      viewerId: 'z',
      joined: false,
    });
    expect(view.spectator).toBe(true);
    expect(view.youPaid).toBe(false);
    expect(boardSettledCopy(view).showBob).toBe(false);
    expect(boardEmptyCopy({ settled: false, spectator: true })).toContain('Join');
  });
});
