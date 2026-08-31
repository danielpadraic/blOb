import { isEvenSplitPayout, type EvenSplitPayoutInput } from './payout';

function asKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function isLmsPayout(challenge: EvenSplitPayoutInput | null | undefined): boolean {
  if (!challenge) {
    return false;
  }
  return (
    Boolean(challenge.is_unlimited) ||
    asKey(challenge.end_mode) === 'indefinite_lms' ||
    asKey(challenge.challenge_type) === 'lms' ||
    asKey(challenge.format) === 'lms'
  );
}

function isRankedAutoSettle(challenge: EvenSplitPayoutInput | null | undefined): boolean {
  if (!challenge || isLmsPayout(challenge)) {
    return false;
  }
  const payout = asKey(challenge.payout_mode);
  const structure = asKey(challenge.prize_structure);
  const type = asKey(challenge.challenge_type);
  const format = asKey(challenge.format);
  const points = type === 'points' || type === 'cumulative' || format === 'points' || format === 'cumulative';
  if (points) {
    return (
      payout === 'winner_take_all' ||
      payout === 'top_places' ||
      structure === 'winner_take_all' ||
      structure === 'top_places'
    );
  }
  return payout === 'winner_take_all' || structure === 'winner_take_all';
}

export const LIFECYCLE_PHASES = ['open', 'live', 'settling', 'settled'] as const;

export type LifecyclePhase = (typeof LIFECYCLE_PHASES)[number];

export const LIFECYCLE_LABELS: Record<LifecyclePhase, string> = {
  open: 'Open',
  live: 'Live',
  settling: 'Settling',
  settled: 'Settled',
};

const OPEN_STATUSES = new Set([
  'draft',
  'upcoming',
  'open',
  'starting',
  'filling',
  'arming',
]);

const LIVE_STATUSES = new Set(['live', 'in_progress']);

const SETTLING_STATUSES = new Set(['ended', 'settling', 'judging', 'distributing']);

const SETTLED_STATUSES = new Set(['settled']);

export function lifecyclePhase(status: string | null | undefined): LifecyclePhase {
  const value = String(status ?? '').toLowerCase();
  if (SETTLED_STATUSES.has(value)) {
    return 'settled';
  }
  if (SETTLING_STATUSES.has(value)) {
    return 'settling';
  }
  if (LIVE_STATUSES.has(value)) {
    return 'live';
  }
  if (OPEN_STATUSES.has(value)) {
    return 'open';
  }
  if (value === 'cancelled' || value === 'cancelled_underfilled') {
    return 'settled';
  }
  return 'open';
}

export function lifecycleLabel(status: string | null | undefined): string {
  return LIFECYCLE_LABELS[lifecyclePhase(status)];
}

export function isEvenSplitAutoSettle(challenge: {
  is_unlimited?: boolean | null;
  end_mode?: string | null;
  challenge_type?: string | null;
  prize_structure?: string | null;
  payout_mode?: string | null;
  format?: string | null;
} | null | undefined): boolean {
  return isEvenSplitPayout(challenge) || isRankedAutoSettle(challenge);
}

export function shouldAutoSettle(challenge: {
  status?: string | null;
  distributed_at?: string | null;
  ends_at?: string | null;
  is_unlimited?: boolean | null;
  end_mode?: string | null;
  challenge_type?: string | null;
  prize_structure?: string | null;
  payout_mode?: string | null;
  format?: string | null;
} | null | undefined, now = new Date()): boolean {
  if (!challenge || !isEvenSplitAutoSettle(challenge)) {
    return false;
  }
  if (challenge.distributed_at || challenge.status === 'settled') {
    return false;
  }
  if (challenge.status === 'cancelled' || challenge.status === 'cancelled_underfilled') {
    return false;
  }
  const phase = lifecyclePhase(challenge.status);
  if (phase === 'settling') {
    return true;
  }
  if (!challenge.ends_at) {
    return false;
  }
  const end = new Date(challenge.ends_at);
  return !Number.isNaN(end.getTime()) && now.getTime() >= end.getTime();
}
