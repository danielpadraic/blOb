import { createClient } from 'npm:@supabase/supabase-js@2';

const MIN_CENTS = 100;
const MAX_CENTS = 5_000;
const DAILY_MAX_CENTS = 25_000;

type Body = {
  amount?: number;
  success_url?: string;
  cancel_url?: string;
};

function json(status: number, payload: Record<string, unknown>, extra?: HeadersInit) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      ...extra,
    },
  });
}

function dollarsToCents(amount: number): number {
  return Math.round(Number(amount) * 100);
}

function isAllowedReturnUrl(value: string): boolean {
  try {
    const url = new URL(value.replace('{CHECKOUT_SESSION_ID}', 'cs_test'));
    if (['javascript:', 'data:', 'file:', 'vbscript:'].includes(url.protocol)) {
      return false;
    }
    return url.protocol.endsWith(':') && Boolean(url.host || url.pathname);
  } catch {
    return false;
  }
}

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('UNAVAILABLE');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function userIdFromRequest(req: Request): Promise<string | null> {
  const auth = req.headers.get('Authorization');
  const url = Deno.env.get('SUPABASE_URL');
  const anon = Deno.env.get('SUPABASE_ANON_KEY');
  if (!auth || !url || !anon) {
    return null;
  }
  const client = createClient(url, anon, {
    auth: { persistSession: false },
    global: { headers: { Authorization: auth } },
  });
  const { data } = await client.auth.getUser();
  return data.user?.id ?? null;
}

async function createCheckoutSession(input: {
  userId: string;
  creditCents: number;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string }> {
  const secret = Deno.env.get('STRIPE_SECRET_KEY');
  if (!secret) {
    throw new Error('UNAVAILABLE');
  }
  const credit = (input.creditCents / 100).toFixed(2);
  const params = new URLSearchParams();
  params.set('mode', 'payment');
  params.set('success_url', input.successUrl);
  params.set('cancel_url', input.cancelUrl);
  params.set('client_reference_id', input.userId);
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'usd');
  params.set('line_items[0][price_data][unit_amount]', String(input.creditCents));
  params.set('line_items[0][price_data][product_data][name]', `Add $${credit}`);
  params.set('metadata[user_id]', input.userId);
  params.set('metadata[credit_cents]', String(input.creditCents));
  params.set('metadata[purpose]', 'wallet_top_up');
  params.set('payment_intent_data[metadata][user_id]', input.userId);
  params.set('payment_intent_data[metadata][credit_cents]', String(input.creditCents));
  params.set('payment_intent_data[metadata][purpose]', 'wallet_top_up');
  params.set('payment_intent_data[description]', `blOb add $${credit}`);

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params,
  });
  const payload = (await response.json()) as { id?: string; url?: string; error?: { message?: string } };
  if (!response.ok || !payload.id || !payload.url) {
    throw new Error(payload.error?.message || 'UNAVAILABLE');
  }
  return { id: payload.id, url: payload.url };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return json(200, { ok: true });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'UNAVAILABLE' });
  }

  try {
    const userId = await userIdFromRequest(req);
    if (!userId) {
      return json(401, { error: 'NOT_AUTHENTICATED' });
    }

    const input = (await req.json()) as Body;
    const creditCents = dollarsToCents(Number(input.amount));
    if (!Number.isFinite(creditCents) || creditCents < MIN_CENTS || creditCents > MAX_CENTS) {
      return json(400, { error: 'AMOUNT_LIMIT' });
    }
    const successUrl = String(input.success_url ?? '');
    const cancelUrl = String(input.cancel_url ?? '');
    if (!isAllowedReturnUrl(successUrl) || !isAllowedReturnUrl(cancelUrl)) {
      return json(400, { error: 'UNAVAILABLE' });
    }

    const supabase = serviceClient();
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    const daily = await supabase
      .from('wallet_top_ups')
      .select('amount, status')
      .eq('user_id', userId)
      .gte('created_at', since.toISOString())
      .in('status', ['pending', 'succeeded']);
    if (daily.error) {
      throw daily.error;
    }
    const usedCents = (daily.data ?? []).reduce(
      (sum, row) => sum + Math.round(Number((row as { amount?: number }).amount ?? 0) * 100),
      0,
    );
    if (usedCents + creditCents > DAILY_MAX_CENTS) {
      return json(400, { error: 'DAILY_LIMIT' });
    }

    const session = await createCheckoutSession({
      userId,
      creditCents,
      successUrl,
      cancelUrl,
    });
    const amount = creditCents / 100;
    const inserted = await supabase.from('wallet_top_ups').insert({
      user_id: userId,
      amount,
      charge_amount: amount,
      currency: 'bucks',
      status: 'pending',
      stripe_checkout_session_id: session.id,
      metadata: { purpose: 'wallet_top_up', credit_cents: creditCents },
    });
    if (inserted.error) {
      throw inserted.error;
    }

    return json(200, {
      ok: true,
      url: session.url,
      session_id: session.id,
      quote: {
        creditCents,
        chargeCents: creditCents,
        platformFeeCents: 0,
        creditAmount: amount,
        chargeAmount: amount,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'UNAVAILABLE';
    const code = message.includes('DAILY')
      ? 'DAILY_LIMIT'
      : message.includes('AMOUNT')
        ? 'AMOUNT_LIMIT'
        : 'UNAVAILABLE';
    console.error('[create-top-up]', message);
    return json(400, { error: code });
  }
});
