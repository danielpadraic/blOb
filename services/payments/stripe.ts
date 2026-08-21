import {
  cancelChallenge,
  distributeChallenge,
  joinChallenge,
  refundPreStart,
} from '@/lib/api/challenges';
import { copy } from '@/lib/copy';
import { getJoinChallengeMessage } from '@/utils/errors';
import {
  cancelProviderRef,
  joinProviderRef,
  parseProviderRef,
  payoutProviderRef,
  type JoinChargeInput,
  type JoinChargeResult,
  type PaymentsProvider,
} from '@/services/payments/types';

function joinFailure(error: unknown): Extract<JoinChargeResult, { ok: false }> {
  const message = getJoinChallengeMessage(error);
  const lower = message.toLowerCase();
  if (lower.includes('geo') || message === copy('geo.unavailable')) {
    return { ok: false, code: 'geo', message: copy('geo.unavailable') };
  }
  if (
    lower.includes('insufficient') ||
    lower.includes('not enough') ||
    lower.includes('you need')
  ) {
    return { ok: false, code: 'insufficient', message };
  }
  if (lower.includes('cancel')) {
    return { ok: false, code: 'canceled', message };
  }
  return { ok: false, code: 'processor', message };
}

/** Existing wallet debit path (join_challenge / cancel / distribute). Not a new Stripe checkout. */
export const stripePayments: PaymentsProvider = {
  id: 'stripe',

  async chargeJoin(input: JoinChargeInput): Promise<JoinChargeResult> {
    try {
      await joinChallenge(input.challengeId);
      return {
        ok: true,
        provider: 'stripe',
        providerRef: joinProviderRef(input.challengeId, input.userId),
      };
    } catch (error) {
      return joinFailure(error);
    }
  },

  async refundJoin(providerRef: string, _amountCents: number, reason: string): Promise<void> {
    const parsed = parseProviderRef(providerRef);
    if (parsed.kind === 'cancel' || reason === 'challenge_cancel' || reason === 'official_cancel') {
      await cancelChallenge(parsed.challengeId);
      return;
    }
    if (parsed.kind === 'join') {
      await refundPreStart(parsed.challengeId, parsed.userId);
      return;
    }
    await cancelChallenge(parsed.challengeId);
  },

  async payout(input: { userId: string; amountCents: number; challengeId: string }) {
    await distributeChallenge(input.challengeId);
    return { providerRef: payoutProviderRef(input.challengeId) };
  },
};

export { cancelProviderRef };
