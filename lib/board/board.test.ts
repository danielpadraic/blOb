import { describe, expect, it } from 'vitest';

import {
  assertsNoBucksWord,
  boardCompletersCount,
  boardEmptyCopy,
  boardMedalTone,
  boardMedalWash,
  boardPhoneFixedReserve,
  boardStatKind,
  initialExpandedBoardIds,
  boardQuantityProgress,
  boardRowTag,
  boardScoreLabel,
  boardScoreOf,
  boardSettledCopy,
  buildBoard,
  formatBoardNestedQty,
  formatBoardPoints,
  pointsLeader,
  pointsRank,
  quantityBoardHeaderLine,
  rankBoardRows,
  shortBoardHeader,
  shortLaneMarkLabel,
  boardHeaderSharesDetailsRow,
  boardLaneSideTotals,
  boardStatusHeaderLine,
  comparableLaneHeaderLine,
  consistencyBoardHeaderLine,
  pointsBoardHeaderLine,
  pluralizeLaneLabel,
} from '@/lib/board';
import { checkinPointValue } from '@/lib/challengePoints';
import { challengeGoalLabel } from '@/lib/challengeGoal';
import { FORFEIT_RECEIPT } from '@/lib/settlement/receipts';

const roster = [
  { user_id: 'a', days_completed: 7, status: 'joined', display_name: 'Ada' },
  { user_id: 'b', days_completed: 7, status: 'active', display_name: 'Bea' },
  { user_id: 'c', days_completed: 2, status: 'eliminated', eliminated_at: '2026-01-01', display_name: 'Cam' },
  { user_id: 'd', days_completed: 0, status: 'refunded_pre_start', display_name: 'Dee' },
  { user_id: 'e', days_completed: 1, status: 'withdrawn', display_name: 'Eve' },
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
    expect(boardEmptyCopy({ settled: false, spectator: true })).toBe('No scores yet');
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
    const laneProof = buildBoard({
      status: 'live',
      participants: [
        { user_id: '01', points: 26000, status: 'joined', display_name: 'Test Rookie 01' },
        { user_id: '09', points: 13000, status: 'joined', display_name: 'Test Veteran 09' },
      ],
    });
    expect(rankBoardRows(laneProof.people, 'points').map((row) => row.userId)).toEqual(['01', '09']);
  });

  it('keeps a never-logged participant on the points board at 0', () => {
    const view = buildBoard({
      status: 'live',
      participants: [
        { user_id: 'zero', points: 0, status: 'joined', display_name: 'Zero' },
        { user_id: 'scored', points: 12, status: 'joined', display_name: 'Scored' },
      ],
    });
    const rows = rankBoardRows(view.people, 'points');
    expect(rows.map((row) => [row.userId, row.score, formatBoardPoints(row.points)])).toEqual([
      ['scored', 12, '12'],
      ['zero', 0, '0'],
    ]);
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
    expect(challengeGoalLabel({ challenge_type: 'points', target_count: 12 })).toBe('0 / 12 pts');
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

describe('board row chrome', () => {
  it('shares medals on tied ranks and never writes pts on the cell', () => {
    const view = buildBoard({
      status: 'live',
      prizePool: 0,
      participants: [
        { user_id: '01', points: 26000, status: 'joined', display_name: 'Test One' },
        { user_id: '03', points: 26000, status: 'joined', display_name: 'Test Three' },
        { user_id: '09', points: 13000, status: 'joined', display_name: 'Test Nine' },
        { user_id: '05', points: 0, status: 'joined', display_name: 'Test Five' },
      ],
    });
    const rows = rankBoardRows(view.people, 'points');
    expect(rows.map((row) => [row.userId, row.rank])).toEqual([
      ['01', 1],
      ['03', 1],
      ['09', 3],
      ['05', 4],
    ]);
    expect(boardMedalTone(1)).toBe('gold');
    expect(boardMedalTone(3)).toBe('bronze');
    expect(boardMedalTone(4)).toBeNull();
    expect(formatBoardPoints(26000)).toBe('26,000');
    expect(formatBoardPoints(0)).toBe('0');
    expect(shortBoardHeader('Presentations')).toBe('Pres');
    expect(shortBoardHeader('miles')).toBe('mi');
  });

  it('ranks a close second as 2, not another gold 1', () => {
    const view = buildBoard({
      status: 'live',
      participants: [
        { user_id: '01', points: 26000, status: 'joined', display_name: 'Test Rookie 01' },
        { user_id: '02', points: 25999, status: 'joined', display_name: 'Test Rookie 02' },
      ],
    });
    expect(rankBoardRows(view.people, 'points').map((row) => [row.userId, row.rank])).toEqual([
      ['01', 1],
      ['02', 2],
    ]);
    expect(boardMedalTone(2)).toBe('silver');
    expect(shortLaneMarkLabel('Rookie')).toBe('Rookie');
    expect(shortLaneMarkLabel('Veteran')).toBe('Veteran');
    expect(shortLaneMarkLabel('Needs a side')).toBe('Needs a side');
    expect(formatBoardNestedQty(3500)).toBe('3,500');
    expect(boardMedalWash('gold')).toBe('rgba(201, 162, 39, 0.08)');
    expect(boardMedalWash(null)).toBeUndefined();
    expect(
      initialExpandedBoardIds(
        [
          { userId: '01', rank: 1 },
          { userId: '03', rank: 1 },
          { userId: '06', rank: 3 },
          { userId: '07', rank: 4 },
        ],
        'points',
      ),
    ).toEqual([]);
    expect(initialExpandedBoardIds([{ userId: '01', rank: 1 }], 'other')).toEqual([]);
  });

  it('locks the phone grid so Test Rookie 01 and 26,000 share one line', () => {
    expect(boardPhoneFixedReserve({ hasSide: true, hasChevron: true })).toBe(220);
    expect(360 - 220).toBeGreaterThanOrEqual(100);
    expect(boardStatKind('Dials')).toBe('dials');
    expect(boardStatKind('Calls')).toBe('dials');
    expect(boardStatKind('Phone')).toBe('dials');
    expect(boardStatKind('Presentations')).toBe('pres');
    expect(boardStatKind('Pres')).toBe('pres');
    expect(boardStatKind('AP')).toBe('ap');
    expect(boardStatKind('Annual Premium')).toBe('ap');
    expect(boardStatKind('Production')).toBe('ap');
    expect(boardStatKind('Closed tickets', true)).toBe('ap');
    expect(boardStatKind('Days')).toBeNull();
    expect(boardStatKind('Miles')).toBeNull();
    expect(shortLaneMarkLabel('Rookie')).toBe('Rookie');
    expect(shortLaneMarkLabel('Veteran')).toBe('Veteran');
    expect(formatBoardPoints(26000)).toBe('26,000');
    expect(formatBoardNestedQty(3500)).toBe('3,500');
  });
});

describe('board status header', () => {
  const lanes = [
    { id: 'rookie', label: 'Rookie' },
    { id: 'veteran', label: 'Veteran' },
  ];
  const rows = [
    { userId: 'a', points: 52000, bucket: 'remaining' },
    { userId: 'b', points: 20000, bucket: 'remaining' },
    { userId: 'c', points: 16839, bucket: 'caught_up' },
    { userId: 'd', points: 9000, bucket: 'dropped' },
    { userId: 'e', points: 4000, bucket: 'remaining' },
  ];
  const laneOf = (userId: string) =>
    ({ a: 'rookie', b: 'veteran', c: 'veteran', d: 'rookie', e: null })[userId] ?? null;

  it('sums racing Pts per Side and skips Dropped / Needs a side', () => {
    const totals = boardLaneSideTotals({ rows, laneOf, lanes });
    expect(totals).toEqual([
      { id: 'rookie', label: 'Rookie', points: 52000 },
      { id: 'veteran', label: 'Veteran', points: 36839 },
    ]);
    expect(comparableLaneHeaderLine(totals)).toBe('Rookie 52,000 · Veteran 36,839');
    expect(boardStatusHeaderLine({ format: 'lanes', racingCount: 4, laneTotals: totals })).toBe(
      'Rookie 52,000 · Veteran 36,839',
    );
    expect(boardStatusHeaderLine({ format: 'lanes', racingCount: 4, laneTotals: totals })).not.toMatch(
      /Completers/,
    );
  });

  it('reads every ranked racing row, not the expanded nest set', () => {
    const openOnly = rows.filter((row) => row.userId === 'a');
    expect(boardLaneSideTotals({ rows: openOnly, laneOf, lanes })[0]?.points).toBe(52000);
    expect(boardLaneSideTotals({ rows, laneOf, lanes })[0]?.points).toBe(52000);
    expect(boardLaneSideTotals({ rows, laneOf, lanes })[1]?.points).toBe(36839);
  });

  it('prints In / Leading on plain points and never Completers', () => {
    expect(pointsBoardHeaderLine(15, 0)).toBe('15 racing');
    expect(pointsBoardHeaderLine(15, 26000)).toBe('In 15 · Leading 26,000');
    expect(boardStatusHeaderLine({ format: 'points', racingCount: 15, leadingScore: 26000 })).not.toMatch(
      /Completers/,
    );
  });

  it('keeps Remaining / Caught Up / Dropped on consistency', () => {
    expect(consistencyBoardHeaderLine(12, 3, 1)).toBe('Remaining 12 · Caught Up 3 · Dropped 1');
    expect(boardStatusHeaderLine({ format: 'consistency', racingCount: 15, remainingCount: 12, caughtUpCount: 3, droppedCount: 1 })).toMatch(
      /Remaining|Caught Up|Dropped/,
    );
  });

  it('keeps quantity In / Done and never Completers', () => {
    expect(quantityBoardHeaderLine(2, 0, 0)).toBe('In 2');
    expect(boardStatusHeaderLine({ format: 'quantity', racingCount: 2, inCount: 2, doneCount: 0 })).not.toMatch(
      /Completers/,
    );
  });

  it('puts long Side totals on their own row next to Show details', () => {
    expect(boardHeaderSharesDetailsRow('Rookie 52,000 · Veteran 36,839', true)).toBe(true);
    expect(boardHeaderSharesDetailsRow('Sides · Rookie 52,000 · Veteran 36,839', true)).toBe(false);
  });

  it('pluralizes Side labels for the VS card without hard-coding a company', () => {
    expect(pluralizeLaneLabel('Rookie')).toBe('Rookies');
    expect(pluralizeLaneLabel('Veteran')).toBe('Veterans');
    expect(pluralizeLaneLabel('Rookies')).toBe('Rookies');
  });
});
