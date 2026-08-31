import { storedDurationDays } from '@/lib/challengeGoal';

/** Proof-review hold after the real end. Official ends_at is already Chicago. */
export const SETTLEMENT_REVIEW_WINDOW_MS = 2 * 60 * 60 * 1000;

export type OverviewMoneyPhase = 'live' | 'ended' | 'settled';

function asInstant(value: string | Date | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function settlementSavedDurationDays(challenge: {
  days_required?: number | null;
  length_value?: number | null;
  length_unit?: string | null;
  duration_days?: number | null;
} | null | undefined): number {
  return Math.max(storedDurationDays(challenge) ?? 0, 0);
}

/** Real end: saved duration wins over a short 6-day ends_at. */
export function settlementEffectiveEndsAt(challenge: {
  is_unlimited?: boolean | null;
  starts_at?: string | null;
  ends_at?: string | null;
  days_required?: number | null;
  length_value?: number | null;
  length_unit?: string | null;
  duration_days?: number | null;
} | null | undefined): Date | null {
  if (!challenge || challenge.is_unlimited) {
    return null;
  }
  const stamped = asInstant(challenge.ends_at);
  const days = settlementSavedDurationDays(challenge);
  const start = asInstant(challenge.starts_at);
  const fromDuration = start && days > 0 ? new Date(start.getTime() + days * 24 * 60 * 60 * 1000) : null;
  if (stamped && fromDuration) {
    return fromDuration.getTime() > stamped.getTime() ? fromDuration : stamped;
  }
  return fromDuration ?? stamped;
}

export function settlementReviewReadyAt(challenge: {
  is_unlimited?: boolean | null;
  starts_at?: string | null;
  ends_at?: string | null;
  days_required?: number | null;
  length_value?: number | null;
  length_unit?: string | null;
  duration_days?: number | null;
} | null | undefined): Date | null {
  const end = settlementEffectiveEndsAt(challenge);
  if (!end) {
    return null;
  }
  return new Date(end.getTime() + SETTLEMENT_REVIEW_WINDOW_MS);
}

export function isSettlementReviewReady(
  challenge: {
    is_unlimited?: boolean | null;
    starts_at?: string | null;
    ends_at?: string | null;
    days_required?: number | null;
    length_value?: number | null;
    length_unit?: string | null;
    duration_days?: number | null;
  } | null | undefined,
  now = new Date(),
): boolean {
  const ready = settlementReviewReadyAt(challenge);
  return Boolean(ready && now.getTime() >= ready.getTime());
}

export function isSettlementClockEnded(
  challenge: {
    is_unlimited?: boolean | null;
    starts_at?: string | null;
    ends_at?: string | null;
    days_required?: number | null;
    length_value?: number | null;
    length_unit?: string | null;
    duration_days?: number | null;
    status?: string | null;
  } | null | undefined,
  now = new Date(),
): boolean {
  const status = String(challenge?.status ?? '');
  if (status === 'ended' || status === 'settling' || status === 'judging' || status === 'distributing') {
    return true;
  }
  const end = settlementEffectiveEndsAt(challenge);
  return Boolean(end && now.getTime() >= end.getTime());
}

export function overviewMoneyPhase(
  challenge: {
    status?: string | null;
    distributed_at?: string | null;
    is_unlimited?: boolean | null;
    starts_at?: string | null;
    ends_at?: string | null;
    days_required?: number | null;
    length_value?: number | null;
    length_unit?: string | null;
    duration_days?: number | null;
  } | null | undefined,
  now = new Date(),
): OverviewMoneyPhase {
  const status = String(challenge?.status ?? '');
  if (status === 'settled' || challenge?.distributed_at) {
    return 'settled';
  }
  if (status === 'cancelled' || status === 'cancelled_underfilled') {
    return 'settled';
  }
  if (isSettlementClockEnded(challenge, now)) {
    return 'ended';
  }
  return 'live';
}

export const WRAPPING_UP_PROOFS_COPY = 'Wrapping up proofs.';
