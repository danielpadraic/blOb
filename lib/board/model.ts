import { lifecyclePhase, type LifecyclePhase } from '@/lib/settlement/lifecycle';

function isLiveCompetitor(row: { status?: string | null; eliminated_at?: string | null }): boolean {
  if (row.eliminated_at) {
    return false;
  }
  const status = String(row.status ?? 'joined');
  return status === 'joined' || status === 'active' || status === 'completed';
}

export type BoardBucket = 'remaining' | 'caught_up' | 'dropped';

export type BoardParticipant = {
  user_id: string;
  days_completed?: number | null;
  points?: number | null;
  status?: string | null;
  eliminated_at?: string | null;
  joined_at?: string | null;
  display_name?: string | null;
  username?: string | null;
};

export type BoardPayout = {
  user_id: string;
  amount?: number | null;
};

export type BoardPerson = {
  userId: string;
  name: string;
  bucket: BoardBucket;
  days: number;
  points: number;
  payout: number | null;
  you: boolean;
};

export type BoardView = {
  people: BoardPerson[];
  remaining: BoardPerson[];
  caughtUp: BoardPerson[];
  dropped: BoardPerson[];
  remainingCount: number;
  caughtUpCount: number;
  droppedCount: number;
  empty: boolean;
  settled: boolean;
  forfeited: boolean;
  phase: LifecyclePhase;
  prizePool: number;
  shareEstimate: number;
  yourPayout: number | null;
  youPaid: boolean;
  spectator: boolean;
  joined: boolean;
};

export function boardDisplayName(row: BoardParticipant): string {
  return row.display_name?.trim() || row.username?.trim() || 'blob';
}

function isDropped(row: BoardParticipant): boolean {
  if (row.eliminated_at) {
    return true;
  }
  const status = String(row.status ?? 'joined');
  return ['eliminated', 'failed', 'refunded_pre_start', 'withdrawn'].includes(status);
}

function neverOnBoard(row: BoardParticipant): boolean {
  return String(row.status ?? '') === 'refunded_pre_start';
}

export function buildBoard(input: {
  status?: string | null;
  prizePool?: number | null;
  participants: BoardParticipant[];
  completedUserIds?: Iterable<string> | null;
  settlement?: {
    winner_count?: number | null;
    prize_pool?: number | null;
    payouts?: BoardPayout[] | null;
  } | null;
  viewerId?: string | null;
  joined?: boolean;
}): BoardView {
  const completed = new Set(input.completedUserIds ?? []);
  const phase = lifecyclePhase(input.status);
  const settled = phase === 'settled' || Boolean(input.settlement);
  const payouts = input.settlement?.payouts ?? [];
  const paidByUser = new Map(
    payouts
      .filter((row) => row.user_id)
      .map((row) => [row.user_id, Number(row.amount ?? 0)]),
  );
  const winnerIds = new Set(paidByUser.keys());
  const forfeited = settled && (Number(input.settlement?.winner_count) || winnerIds.size) === 0;
  const prizePool = settled
    ? Number(input.settlement?.prize_pool ?? input.prizePool ?? 0)
    : Number(input.prizePool ?? 0);
  const viewerId = input.viewerId ?? null;
  const joined = Boolean(input.joined);

  const people = input.participants
    .filter((row) => !neverOnBoard(row))
    .map((row) => {
      const live = !isDropped(row) && isLiveCompetitor(row);
      const paid = paidByUser.has(row.user_id);
      let bucket: BoardBucket;
      if (settled) {
        if (forfeited) {
          bucket = 'dropped';
        } else if (paid || winnerIds.has(row.user_id)) {
          bucket = 'remaining';
        } else {
          bucket = 'dropped';
        }
      } else if (!live) {
        bucket = 'dropped';
      } else if (completed.has(row.user_id)) {
        bucket = 'caught_up';
      } else {
        bucket = 'remaining';
      }
      return {
        userId: row.user_id,
        name: boardDisplayName(row),
        bucket,
        days: Number(row.days_completed) || 0,
        points: Math.max(Number(row.points) || 0, 0),
        payout: paid ? paidByUser.get(row.user_id) ?? 0 : null,
        you: Boolean(viewerId && row.user_id === viewerId),
      } satisfies BoardPerson;
    })
    .sort((a, b) => {
      const order = { caught_up: 0, remaining: 1, dropped: 2 };
      return order[a.bucket] - order[b.bucket] || b.days - a.days || a.name.localeCompare(b.name);
    });

  const remaining = people.filter((row) => row.bucket === 'remaining' || row.bucket === 'caught_up');
  const caughtUp = people.filter((row) => row.bucket === 'caught_up' || (settled && row.bucket === 'remaining'));
  const dropped = people.filter((row) => row.bucket === 'dropped');
  const remainingCount = remaining.length;
  const yourPayout = viewerId ? paidByUser.get(viewerId) ?? null : null;

  return {
    people,
    remaining,
    caughtUp: settled ? remaining : caughtUp,
    dropped,
    remainingCount,
    caughtUpCount: settled ? remainingCount : caughtUp.length,
    droppedCount: dropped.length,
    empty: people.length === 0,
    settled,
    forfeited,
    phase,
    prizePool,
    shareEstimate: remainingCount > 0 ? prizePool / remainingCount : 0,
    yourPayout,
    youPaid: Number(yourPayout) > 0,
    spectator: !joined,
    joined,
  };
}

export function compactCountsFromStats(challenge: {
  status?: string | null;
  participant_count?: number | null;
  eligible_count?: number | null;
  eliminated_count?: number | null;
}): Pick<BoardView, 'remainingCount' | 'caughtUpCount' | 'droppedCount' | 'settled' | 'forfeited' | 'phase' | 'empty'> {
  const phase = lifecyclePhase(challenge.status);
  const droppedCount = Math.max(Number(challenge.eliminated_count) || 0, 0);
  const remainingCount = Math.max(
    Number(challenge.eligible_count ?? challenge.participant_count) || 0,
    0,
  );
  return {
    remainingCount,
    caughtUpCount: 0,
    droppedCount,
    settled: phase === 'settled',
    forfeited: phase === 'settled' && remainingCount === 0,
    phase,
    empty: remainingCount === 0 && droppedCount === 0,
  };
}
