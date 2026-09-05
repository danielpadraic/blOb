import { FUNDING_COPY } from './copy';
import { isGeoGateDeny } from '@/lib/geo/eligibility';
import { copy } from '@/lib/copy';

export type FundingRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string; code?: string; details?: string } | null }>;
};

export type TopUpPrizeResult = {
  ok: true;
  challenge_id: string;
  prize_pool: number;
  host_contribution: number;
  already_applied?: boolean;
};

function rpcMessage(error: { message?: string } | null | undefined): string {
  const raw = String(error?.message ?? '');
  if (isGeoGateDeny(raw)) {
    return copy('geo.unavailable');
  }
  const lower = raw.toLowerCase();
  if (lower.includes('not_authenticated')) {
    return 'Sign in to continue.';
  }
  if (lower.includes('not_host') || lower.includes('not_creator')) {
    return 'Only the host can add to the prize.';
  }
  if (lower.includes('already_settled') || lower.includes('too_late')) {
    return FUNDING_COPY.alreadySettled;
  }
  if (lower.includes('insufficient')) {
    return FUNDING_COPY.insufficient;
  }
  if (lower.includes('offline') || lower.includes('failed to fetch') || lower.includes('network')) {
    return 'You’re offline. Try again when you’re back.';
  }
  if (lower.includes('negative') || lower.includes('invalid_amount')) {
    return 'Enter an amount to add.';
  }
  return 'Couldn’t add to the prize. Try again.';
}

export async function topUpChallengePrizeWithClient(
  client: FundingRpcClient,
  input: { challengeId: string; amount: number; requestId?: string | null },
): Promise<TopUpPrizeResult> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Enter an amount to add.');
  }
  const { data, error } = await client.rpc('top_up_challenge_prize', {
    p_challenge_id: input.challengeId,
    p_amount: amount,
    p_request_id: input.requestId ?? null,
  });
  if (error) {
    throw new Error(rpcMessage(error));
  }
  const row = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  return {
    ok: true,
    challenge_id: String(row.challenge_id ?? input.challengeId),
    prize_pool: Number(row.prize_pool ?? 0),
    host_contribution: Number(row.host_contribution ?? row.creator_contribution ?? 0),
    already_applied: Boolean(row.already_applied),
  };
}
