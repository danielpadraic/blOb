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
} | null | undefined): boolean {
  if (!challenge) {
    return false;
  }
  if (challenge.is_unlimited) {
    return false;
  }
  if (challenge.end_mode === 'indefinite_lms' || challenge.challenge_type === 'lms') {
    return false;
  }
  const structure = String(challenge.prize_structure ?? 'equal_split');
  return structure !== 'winner_take_all' && structure !== 'top_places';
}

export function shouldAutoSettle(challenge: {
  status?: string | null;
  distributed_at?: string | null;
  ends_at?: string | null;
  is_unlimited?: boolean | null;
  end_mode?: string | null;
  challenge_type?: string | null;
  prize_structure?: string | null;
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
