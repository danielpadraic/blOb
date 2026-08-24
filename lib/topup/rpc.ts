import { TOPUP_COPY } from './copy';
import { classifyTopUpError, topUpErrorCopy } from './errors';
import { quoteTopUp, validateTopUpAmount, type TopUpQuote, type TopUpResult, type TopUpSession } from './model';

export type TopUpFnClient = {
  functions: {
    invoke: (
      name: string,
      args?: { body?: Record<string, unknown> },
    ) => PromiseLike<{ data: unknown; error: { message?: string } | null }>;
  };
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        maybeSingle: () => PromiseLike<{
          data: Record<string, unknown> | null;
          error: { message?: string } | null;
        }>;
      };
    };
  };
};

export async function createTopUpSessionWithClient(
  client: TopUpFnClient,
  input: { amount: number; successUrl: string; cancelUrl: string },
): Promise<TopUpSession> {
  const check = validateTopUpAmount(input.amount);
  if (check !== 'ok') {
    throw new Error(topUpErrorCopy(check === 'limit' ? 'amount_limit' : 'invalid'));
  }
  const local = quoteTopUp(input.amount);
  if (!local) {
    throw new Error(TOPUP_COPY.amountLimit);
  }
  const { data, error } = await client.functions.invoke('create-top-up', {
    body: {
      amount: local.creditAmount,
      success_url: input.successUrl,
      cancel_url: input.cancelUrl,
    },
  });
  if (error) {
    throw new Error(topUpErrorCopy(classifyTopUpError(error)));
  }
  const row = (data ?? {}) as Record<string, unknown>;
  if (row.error) {
    throw new Error(topUpErrorCopy(String(row.error)));
  }
  const url = String(row.url ?? '');
  const sessionId = String(row.session_id ?? row.sessionId ?? '');
  if (!url || !sessionId) {
    throw new Error(TOPUP_COPY.unavailable);
  }
  const quote = (row.quote as TopUpQuote | undefined) ?? local;
  return { url, sessionId, quote };
}

export async function waitForTopUpCreditWithClient(
  client: TopUpFnClient,
  input: { sessionId: string; timeoutMs?: number },
): Promise<TopUpResult> {
  const deadline = Date.now() + Math.max(input.timeoutMs ?? 12_000, 2_000);
  let last: Record<string, unknown> | null = null;
  while (Date.now() < deadline) {
    const { data, error } = await client
      .from('wallet_top_ups')
      .select('status, amount, error_code, stripe_checkout_session_id')
      .eq('stripe_checkout_session_id', input.sessionId)
      .maybeSingle();
    if (error) {
      throw new Error(topUpErrorCopy(classifyTopUpError(error)));
    }
    last = data;
    const status = String(data?.status ?? '');
    if (status === 'succeeded') {
      return {
        status: 'succeeded',
        amount: Number(data?.amount ?? 0),
        alreadyApplied: true,
      };
    }
    if (status === 'failed') {
      return { status: 'failed', code: String(data?.error_code ?? 'declined') };
    }
    if (status === 'canceled') {
      return { status: 'canceled' };
    }
    await sleep(500);
  }
  if (last) {
    return { status: 'pending' };
  }
  return { status: 'pending' };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
