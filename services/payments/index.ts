import { stripePayments } from '@/services/payments/stripe';
import type { PaymentsProvider, PaymentsProviderId } from '@/services/payments/types';

export type {
  JoinChargeInput,
  JoinChargeResult,
  MoneyCents,
  PaymentsProvider,
  PaymentsProviderId,
} from '@/services/payments/types';

export { cancelProviderRef, joinProviderRef, payoutProviderRef } from '@/services/payments/types';

function readProviderId(): PaymentsProviderId {
  const raw = String(
    process.env.EXPO_PUBLIC_PAYMENTS_PROVIDER ?? process.env.PAYMENTS_PROVIDER ?? 'stripe',
  )
    .trim()
    .toLowerCase();
  if (raw === 'stripe') {
    return 'stripe';
  }
  throw new Error(
    `PAYMENTS_PROVIDER=${raw || '(empty)'} is not supported. Set PAYMENTS_PROVIDER=stripe.`,
  );
}

let cached: PaymentsProvider | null = null;

export function getPaymentsProvider(): PaymentsProvider {
  if (cached) {
    return cached;
  }
  const id = readProviderId();
  if (id !== 'stripe') {
    throw new Error(`PAYMENTS_PROVIDER=${id} is not supported. Set PAYMENTS_PROVIDER=stripe.`);
  }
  cached = stripePayments;
  return cached;
}

export function paymentsProviderError(): string | null {
  try {
    getPaymentsProvider();
    return null;
  } catch (error) {
    return error instanceof Error
      ? error.message
      : 'PAYMENTS_PROVIDER is not supported. Set PAYMENTS_PROVIDER=stripe.';
  }
}
