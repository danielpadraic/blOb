import type { ChallengePayout, ChallengeSettlementView } from '@/lib/types';

import { classifySettlementError, settlementErrorCopy } from './errors';

export type SettlementRpcClient = {
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => PromiseLike<{ data: unknown; error: { message?: string; code?: string; details?: string } | null }>;
};

function asView(data: unknown, challengeId: string): ChallengeSettlementView {
  const row = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const settlement = (row.settlement && typeof row.settlement === 'object'
    ? (row.settlement as Record<string, unknown>)
    : {}) as Record<string, unknown>;
  const rawPayouts = Array.isArray(row.payouts) ? row.payouts : [];
  const payouts: ChallengePayout[] = rawPayouts
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }
      const payout = item as Record<string, unknown>;
      const userId = String(payout.user_id ?? '');
      if (!userId) {
        return null;
      }
      return {
        user_id: userId,
        place: Number(payout.place ?? 1),
        score: Number(payout.score ?? 0),
        amount: Number(payout.amount ?? 0),
        reason: String(payout.reason ?? 'distribute_win'),
      } satisfies ChallengePayout;
    })
    .filter((item): item is ChallengePayout => Boolean(item));

  const distributedField = settlement.distributed;
  const distributed = Array.isArray(distributedField)
    ? distributedField.reduce((sum, item) => {
        if (!item || typeof item !== 'object') {
          return sum;
        }
        return sum + Number((item as { amount?: number }).amount ?? 0);
      }, 0)
    : Number(distributedField ?? 0);

  return {
    already_settled: Boolean(row.already_settled ?? true),
    settlement: {
      id: String(settlement.id ?? challengeId),
      challenge_id: String(settlement.challenge_id ?? challengeId),
      settled_by: (settlement.settled_by as string | null) ?? null,
      prize_pool: Number(settlement.prize_pool ?? 0),
      distributed,
      prize_structure: String(settlement.prize_structure ?? 'equal_split'),
      winner_count: Number(settlement.winner_count ?? payouts.length),
      settled_at: String(settlement.settled_at ?? new Date().toISOString()),
      slices: payouts,
    },
    payouts,
  };
}

export async function tickSettlementsWithClient(client: SettlementRpcClient): Promise<void> {
  const { error } = await client.rpc('tick_settlements');
  if (error && classifySettlementError(error) !== 'offline') {
    console.log('[blob:settlement] tick skipped', error.message);
  }
}

export async function getChallengeSettlementWithClient(
  client: SettlementRpcClient,
  challengeId: string,
): Promise<ChallengeSettlementView | null> {
  const { data, error } = await client.rpc('get_challenge_settlement', {
    p_challenge_id: challengeId,
  });
  if (error || !data) {
    return null;
  }
  return asView(data, challengeId);
}

export async function settleEndedChallengeWithClient(
  client: SettlementRpcClient,
  challengeId: string,
): Promise<ChallengeSettlementView> {
  const { data, error } = await client.rpc('settle_ended_challenge', {
    p_challenge_id: challengeId,
  });
  if (error) {
    if (classifySettlementError(error) === 'already_settled') {
      const existing = await getChallengeSettlementWithClient(client, challengeId);
      if (existing) {
        return existing;
      }
    }
    throw new Error(settlementErrorCopy(error));
  }
  return asView(data, challengeId);
}

export async function trySettleIfEndedWithClient(
  client: SettlementRpcClient,
  challengeId: string,
): Promise<ChallengeSettlementView | null> {
  try {
    await tickSettlementsWithClient(client);
    return await getChallengeSettlementWithClient(client, challengeId);
  } catch (error) {
    const kind = classifySettlementError(error);
    if (kind === 'not_ended' || kind === 'already_settled' || kind === 'offline') {
      return getChallengeSettlementWithClient(client, challengeId);
    }
    throw error;
  }
}
