export type MoneyCents = number;

export type PaymentsProviderId = 'stripe' | 'none';

export type JoinChargeInput = {
  userId: string;
  challengeId: string;
  amountCents: MoneyCents;
  currency: 'usd' | 'coins';
};

export type JoinChargeResult =
  | { ok: true; provider: PaymentsProviderId; providerRef: string }
  | { ok: false; code: 'insufficient' | 'geo' | 'processor' | 'canceled'; message: string };

export interface PaymentsProvider {
  id: PaymentsProviderId;
  chargeJoin(input: JoinChargeInput): Promise<JoinChargeResult>;
  refundJoin(providerRef: string, amountCents: MoneyCents, reason: string): Promise<void>;
  payout(input: { userId: string; amountCents: MoneyCents; challengeId: string }): Promise<{
    providerRef: string;
  }>;
}

export function joinProviderRef(challengeId: string, userId: string): string {
  return `join:${challengeId}:${userId}`;
}

export function cancelProviderRef(challengeId: string): string {
  return `cancel:${challengeId}`;
}

export function payoutProviderRef(challengeId: string): string {
  return `payout:${challengeId}`;
}

export function parseProviderRef(providerRef: string): {
  kind: 'join' | 'cancel' | 'payout' | 'unknown';
  challengeId: string;
  userId?: string;
} {
  const [kind, challengeId, userId] = providerRef.split(':');
  if (kind === 'join' && challengeId && userId) {
    return { kind, challengeId, userId };
  }
  if ((kind === 'cancel' || kind === 'payout') && challengeId) {
    return { kind, challengeId };
  }
  return { kind: 'unknown', challengeId: providerRef };
}
