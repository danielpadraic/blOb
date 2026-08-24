import { createClient } from 'npm:@supabase/supabase-js@2';

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('Missing Supabase service credentials');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

function parseStripeSignature(header: string): { timestamp: string; signatures: string[] } {
  const timestamp = header
    .split(',')
    .find((part) => part.startsWith('t='))
    ?.slice(2);
  const signatures = header
    .split(',')
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3));
  return { timestamp: timestamp ?? '', signatures };
}

function hexFromBuffer(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) {
    diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  }
  return diff === 0;
}

async function verifyStripeSignature(payload: string, header: string, secret: string): Promise<boolean> {
  const { timestamp, signatures } = parseStripeSignature(header);
  if (!timestamp || signatures.length === 0) {
    return false;
  }
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > 300) {
    return false;
  }
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`));
  const digest = hexFromBuffer(signed);
  return signatures.some((signature) => timingSafeEqual(digest, signature));
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function metadataOf(value: unknown): Record<string, string> {
  const row = asRecord(value);
  const out: Record<string, string> = {};
  for (const [key, item] of Object.entries(row)) {
    if (item != null) {
      out[key] = String(item);
    }
  }
  return out;
}

async function markFailed(input: {
  sessionId?: string | null;
  paymentIntentId?: string | null;
  code: string;
}): Promise<void> {
  const supabase = serviceClient();
  if (input.sessionId) {
    await supabase
      .from('wallet_top_ups')
      .update({ status: 'failed', error_code: input.code, stripe_payment_intent_id: input.paymentIntentId })
      .eq('stripe_checkout_session_id', input.sessionId)
      .in('status', ['pending']);
  }
  if (input.paymentIntentId) {
    await supabase
      .from('wallet_top_ups')
      .update({ status: 'failed', error_code: input.code })
      .eq('stripe_payment_intent_id', input.paymentIntentId)
      .in('status', ['pending']);
  }
}

async function creditFromSession(session: Record<string, unknown>): Promise<void> {
  const metadata = metadataOf(session.metadata);
  const sessionId = String(session.id ?? '');
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : String(asRecord(session.payment_intent).id ?? '');
  const userId = metadata.user_id || String(session.client_reference_id ?? '');
  const supabase = serviceClient();
  const existing = sessionId
    ? await supabase
        .from('wallet_top_ups')
        .select('user_id, amount, charge_amount, status')
        .eq('stripe_checkout_session_id', sessionId)
        .maybeSingle()
    : { data: null, error: null };
  if (existing.error) {
    throw existing.error;
  }
  const row = existing.data as { user_id?: string; amount?: number; charge_amount?: number; status?: string } | null;
  const creditUser = row?.user_id || userId;
  const amount = Number(row?.amount ?? Number(metadata.credit_cents ?? 0) / 100);
  if (!creditUser || !paymentIntentId || !Number.isFinite(amount) || amount <= 0) {
    throw new Error('INVALID_TOP_UP');
  }
  const { error } = await supabase.rpc('credit_wallet_top_up', {
    p_user_id: creditUser,
    p_amount: amount,
    p_payment_intent_id: paymentIntentId,
    p_checkout_session_id: sessionId || null,
    p_charge_amount: Number(row?.charge_amount ?? amount),
    p_metadata: { purpose: 'wallet_top_up' },
  });
  if (error) {
    throw error;
  }
}

async function creditFromPaymentIntent(intent: Record<string, unknown>): Promise<void> {
  const metadata = metadataOf(intent.metadata);
  const paymentIntentId = String(intent.id ?? '');
  const userId = metadata.user_id;
  const supabase = serviceClient();
  const existing = paymentIntentId
    ? await supabase
        .from('wallet_top_ups')
        .select('user_id, amount, charge_amount, stripe_checkout_session_id, status')
        .eq('stripe_payment_intent_id', paymentIntentId)
        .maybeSingle()
    : { data: null };
  let row = existing.data as {
    user_id?: string;
    amount?: number;
    charge_amount?: number;
    stripe_checkout_session_id?: string;
    status?: string;
  } | null;
  if (!row && userId) {
    const creditCents = Number(metadata.credit_cents ?? 0);
    const matchAmount = creditCents > 0 ? creditCents / 100 : null;
    let query = supabase
      .from('wallet_top_ups')
      .select('user_id, amount, charge_amount, stripe_checkout_session_id, status')
      .eq('user_id', userId)
      .eq('status', 'pending');
    if (matchAmount != null) {
      query = query.eq('amount', matchAmount);
    }
    const pending = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
    row = pending.data as typeof row;
  }
  const creditUser = row?.user_id || userId;
  const amount = Number(row?.amount ?? Number(metadata.credit_cents ?? 0) / 100);
  if (!creditUser || !paymentIntentId || !Number.isFinite(amount) || amount <= 0) {
    return;
  }
  const { error } = await supabase.rpc('credit_wallet_top_up', {
    p_user_id: creditUser,
    p_amount: amount,
    p_payment_intent_id: paymentIntentId,
    p_checkout_session_id: row?.stripe_checkout_session_id ?? null,
    p_charge_amount: Number(row?.charge_amount ?? amount),
    p_metadata: { purpose: 'wallet_top_up' },
  });
  if (error) {
    throw error;
  }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'POST only' });
  }
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!secret) {
    return json(500, { ok: false, error: 'UNAVAILABLE' });
  }
  const payload = await req.text();
  const header = req.headers.get('stripe-signature') ?? '';
  const ok = await verifyStripeSignature(payload, header, secret);
  if (!ok) {
    return json(400, { ok: false, error: 'invalid_signature' });
  }

  let event: { type?: string; data?: { object?: Record<string, unknown> } };
  try {
    event = JSON.parse(payload) as typeof event;
  } catch {
    return json(400, { ok: false, error: 'invalid_json' });
  }

  try {
    const object = asRecord(event.data?.object);
    switch (event.type) {
      case 'checkout.session.completed':
      case 'checkout.session.async_payment_succeeded':
        if (String(object.payment_status ?? '') === 'unpaid') {
          break;
        }
        await creditFromSession(object);
        break;
      case 'checkout.session.expired':
      case 'checkout.session.async_payment_failed':
        await markFailed({
          sessionId: String(object.id ?? ''),
          paymentIntentId: typeof object.payment_intent === 'string' ? object.payment_intent : null,
          code: 'canceled',
        });
        break;
      case 'payment_intent.succeeded':
        await creditFromPaymentIntent(object);
        break;
      case 'payment_intent.payment_failed': {
        const err = asRecord(asRecord(object.last_payment_error).code ? object.last_payment_error : object);
        await markFailed({
          paymentIntentId: String(object.id ?? ''),
          code: String(err.code ?? 'card_declined'),
        });
        break;
      }
      default:
        break;
    }
    return json(200, { ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'webhook_failed';
    console.error('[stripe-webhook]', event.type, message);
    return json(500, { ok: false, error: message });
  }
});
