import { evenSplitShares } from '@/lib/settlement/shares';

export type FundingSnapshot = {
  entryFee: number;
  hostContribution: number;
  entryFeesCollected: number;
  prizeTotal: number;
  currency: 'coins' | 'bucks';
  privateLocked: boolean;
};

export type FundingChallenge = {
  buy_in_amount?: number | null;
  creator_contribution?: number | null;
  host_budget?: number | null;
  prize_pool?: number | null;
  currency?: string | null;
  privacy_mode?: string | null;
  challenge_lane?: string | null;
  visibility?: string | null;
  is_official?: boolean | null;
};

const COMMITTED_STATUSES = new Set([
  'live',
  'ended',
  'settling',
  'judging',
  'distributing',
  'settled',
  'cancelled',
  'cancelled_underfilled',
]);

export function isPrivateFundingLock(challenge: {
  privacy_mode?: string | null;
  challenge_lane?: string | null;
  visibility?: string | null;
} | null | undefined): boolean {
  if (!challenge) {
    return false;
  }
  return (
    challenge.challenge_lane === 'private' ||
    challenge.privacy_mode === 'private_corporate' ||
    challenge.privacy_mode === 'private'
  );
}

export function fundingModelOf(input: {
  entryFee: number;
  hostContribution: number;
  privateLocked?: boolean;
}): 'creator' | 'hybrid' | 'participants' {
  if (input.privateLocked) {
    return 'creator';
  }
  if (input.entryFee > 0 && input.hostContribution > 0) {
    return 'hybrid';
  }
  if (input.hostContribution > 0) {
    return 'creator';
  }
  return 'participants';
}

export function fundingFromChallenge(challenge: FundingChallenge | null | undefined): FundingSnapshot {
  const entryFee = Math.max(Number(challenge?.buy_in_amount) || 0, 0);
  const hostContribution = Math.max(Number(challenge?.creator_contribution) || 0, 0);
  const prizeTotal = Math.max(Number(challenge?.prize_pool) || 0, 0);
  const entryFeesCollected = Math.max(Number((prizeTotal - hostContribution).toFixed(2)), 0);
  const privateLocked = isPrivateFundingLock(challenge);
  return {
    entryFee: privateLocked ? 0 : entryFee,
    hostContribution,
    entryFeesCollected,
    prizeTotal,
    currency: String(challenge?.currency ?? '') === 'bucks' ? 'bucks' : 'coins',
    privateLocked,
  };
}

export function predictedPrize(input: {
  entryFee: number;
  hostContribution: number;
  participantCount: number;
}): number {
  const fee = Math.max(Number(input.entryFee) || 0, 0);
  const host = Math.max(Number(input.hostContribution) || 0, 0);
  const count = Math.max(Math.floor(Number(input.participantCount) || 0), 0);
  return Number((host + fee * count).toFixed(2));
}

export function evenSplitCombinedPrize(
  prizeTotal: number,
  remainingFinishers: number,
  currency?: string | null,
): number[] {
  return evenSplitShares(
    Math.max(Number(prizeTotal) || 0, 0),
    Math.max(remainingFinishers, 0),
    currency,
  );
}

export function canRefundEntryFee(status?: string | null): boolean {
  return !COMMITTED_STATUSES.has(String(status ?? ''));
}

export function canHostTopUp(input: {
  status?: string | null;
  isHost?: boolean;
  official?: boolean;
}): boolean {
  if (!input.isHost || input.official) {
    return false;
  }
  const status = String(input.status ?? '');
  return !['ended', 'settling', 'judging', 'distributing', 'settled', 'cancelled', 'cancelled_underfilled'].includes(
    status,
  );
}

export function joinShortfall(wallet: number, entryFee: number): number {
  return Math.max(0, Number((Math.max(Number(entryFee) || 0, 0) - Math.max(Number(wallet) || 0, 0)).toFixed(2)));
}
