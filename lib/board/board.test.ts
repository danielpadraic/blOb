import { describe, expect, it } from 'vitest';

import {
  assertsNoBucksWord,
  boardCompletersCount,
  boardEmptyCopy,
  boardQuantityProgress,
  boardRowTag,
  boardScoreLabel,
  boardScoreOf,
  boardSettledCopy,
  buildBoard,
  pointsLeader,
  pointsRank,
  quantityBoardHeaderLine,
  rankBoardRows,
} from '@/lib/board';
import { checkinPointValue } from '@/lib/challengePoints';
import { challengeGoalLabel } from '@/lib/challengeGoal';
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
    expect(copy.showBob).toBe(false);
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
    expect(boardEmptyCopy({ settled: false, spectator: true })).toBe('Board fills when people join.');
  });
});

describe('points board ranking', () => {
  it('ranks live contestants by points and waits for a scored leader', () => {
    const view = buildBoard({
      status: 'live',
      participants: [
        { user_id: 'a', points: 0, status: 'joined', display_name: 'Ada' },
        { user_id: 'b', points: 4, status: 'joined', display_name: 'Bea' },
        { user_id: 'c', points: 1, status: 'eliminated', eliminated_at: '2026-01-01', display_name: 'Cam' },
      ],
      viewerId: 'a',
      joined: true,
    });
    expect(pointsRank(view.people, 'a')).toBe(2);
    expect(pointsLeader(view.people)?.userId).toBe('b');
    expect(pointsLeader(view.people)?.name).toBe('Bea');
  });

  it('has no challenge leader until someone scores', () => {
    const view = buildBoard({
      status: 'live',
      participants: [{ user_id: 'a', points: 0, status: 'joined', display_name: 'Ada' }],
      viewerId: 'a',
      joined: true,
    });
    expect(pointsLeader(view.people)).toBeNull();
    expect(pointsRank(view.people, 'z')).toBeNull();
  });
});

describe('ranked board', () => {
  it('ranks still-in by score then name, and puts Out last', () => {
    const view = buildBoard({
      status: 'live',
      participants: [
        { user_id: 'd', days_completed: 1, status: 'joined', display_name: 'Dee' },
        { user_id: 'a', days_completed: 3, status: 'joined', display_name: 'Ada' },
        { user_id: 'c', days_completed: 2, status: 'eliminated', eliminated_at: '2026-01-02', display_name: 'Cam' },
        { user_id: 'b', days_completed: 3, status: 'joined', display_name: 'Bea' },
      ],
      completedUserIds: ['a'],
    });
    const rows = rankBoardRows(view.people, 'days');
    expect(rows.map((row) => row.userId)).toEqual(['a', 'b', 'd', 'c']);
    expect(rows[0]?.rank).toBe(1);
    expect(rows[3]?.rank).toBeNull();
    expect(boardScoreLabel(rows[0]!, { pointsBoard: false, requiredDays: 7 })).toBe('3/7');
  });
});

describe('points board score', () => {
  it('shows task points, not check-in count', () => {
    const view = buildBoard({
      status: 'live',
      participants: [
        { user_id: 'd', days_completed: 2, points: 20, status: 'joined', display_name: 'Daniel' },
        { user_id: 's', days_completed: 0, points: 0, status: 'joined', display_name: 'Sam' },
      ],
    });
    const rows = rankBoardRows(view.people, 'points');
    expect(boardScoreLabel(rows[0]!, { pointsBoard: true, requiredDays: 7 })).toBe('20');
    expect(boardScoreLabel(rows[1]!, { pointsBoard: true, requiredDays: 7 })).toBe('0');
    expect(boardScoreOf(rows[0]!, 'points')).toBe(20);
    expect(boardScoreOf(rows[1]!, 'points')).toBe(0);
    expect(checkinPointValue({ tasks: [{ title: 'Pray', points: 10, once: false }] })).toBe(10);
    expect(boardCompletersCount(view.people)).toBe(0);
  });
});

describe('points goal', () => {
  it('labels comparable-points Score Points and task-points Reach N', () => {
    expect(challengeGoalLabel({ scoring_method: 'comparable_points', challenge_type: 'points' })).toBe(
      'Score Points',
    );
    expect(challengeGoalLabel({ challenge_type: 'points', target_count: 12 })).toBe('0 / 12 points');
  });

  it('labels total-count fitness as N of T Check-Ins', () => {
    expect(
      challengeGoalLabel(
        { frequency: 'custom', target_count: 6, days_required: 7, challenge_type: 'consistency' },
        { daysCompleted: 1 },
      ),
    ).toBe('1 of 6 Check-Ins');
  });
});

const RUN_128 = {
  challenge_type: 'cumulative',
  format: 'cumulative',
  scoring_method: 'consistency',
  target_count: 127,
  days_required: 127,
  length_value: 127,
  cumulative_metric: 'distance_m',
  cumulative_target: 205996,
  metrics: [{ id: 'm1', name: 'miles', unit: 'mi', target: 128 }],
  title: 'Run 128 Miles by January 1',
};

describe('quantity Board (Run 128 miles)', () => {
  it('scores logged miles over the saved 128 target, not 1/127 Caught up', () => {
    const view = buildBoard({
      status: 'live',
      prizePool: 20,
      participants: [
        {
          user_id: 'daniel',
          days_completed: 1,
          distance_meters_total: 10026,
          metric_totals: {},
          status: 'joined',
          display_name: 'Daniel Harder',
        },
        {
          user_id: 'courtney',
          days_completed: 0,
          distance_meters_total: 0,
          metric_totals: {},
          status: 'joined',
          display_name: 'Courtney',
        },
      ],
      completedUserIds: [],
      viewerId: 'daniel',
      joined: true,
    });
    const people = view.people.map((row) => ({
      ...row,
      quantity:
        boardQuantityProgress(RUN_128, {
          distanceMeters: row.userId === 'daniel' ? 10026 : 0,
          metricTotals: {},
        })?.logged ?? 0,
    }));
    const rows = rankBoardRows(people, 'quantity');
    const daniel = rows.find((row) => row.userId === 'daniel')!;
    const courtney = rows.find((row) => row.userId === 'courtney')!;
    const danielProgress = boardQuantityProgress(RUN_128, {
      distanceMeters: 10026,
      metricTotals: {},
    });
    const courtneyProgress = boardQuantityProgress(RUN_128, {
      distanceMeters: 0,
      metricTotals: {},
    });
    expect(danielProgress?.label).toBe('6.23 / 128 mi');
    expect(courtneyProgress?.label).toBe('0 / 128 mi');
    expect(boardScoreLabel(daniel, { pointsBoard: false, requiredDays: 127, quantityLabel: danielProgress?.label })).toBe(
      '6.23 / 128 mi',
    );
    expect(boardScoreLabel(courtney, { pointsBoard: false, requiredDays: 127, quantityLabel: courtneyProgress?.label })).toBe(
      '0 / 128 mi',
    );
    expect(daniel.rank).toBe(1);
    expect(courtney.rank).toBe(2);
    expect(boardRowTag(daniel, false, { quantityDone: Boolean(danielProgress?.done) })).toBe('In');
    expect(boardRowTag(courtney, false, { quantityDone: Boolean(courtneyProgress?.done) })).toBe('In');
    expect(quantityBoardHeaderLine(2, 0, 0)).toBe('In 2');
    expect(quantityBoardHeaderLine(2, 0, 0)).not.toMatch(/Caught Up|Remaining|127/);
    expect(danielProgress?.label).not.toMatch(/127/);
    expect(challengeGoalLabel(RUN_128, { distanceMetersCompleted: 10026, metricTotals: {}, unit: 'mi' })).toBe(
      '6.23 / 128 mi',
    );
    expect(challengeGoalLabel(RUN_128, { distanceMetersCompleted: 0, metricTotals: {}, unit: 'mi' })).toBe(
      '0 / 128 mi',
    );
  });
});
