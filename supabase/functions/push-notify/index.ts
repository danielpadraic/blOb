import { createClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  sound?: string;
  data?: Record<string, unknown>;
};

type PushBody = {
  notification_id?: string;
  user_ids?: string[];
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
  messages?: ExpoMessage[];
};

function json(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function asMessages(value: unknown): ExpoMessage[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((row): row is ExpoMessage => {
    return Boolean(
      row &&
        typeof row === 'object' &&
        typeof (row as ExpoMessage).to === 'string' &&
        typeof (row as ExpoMessage).title === 'string',
    );
  });
}

async function sendExpo(messages: ExpoMessage[]): Promise<void> {
  if (messages.length === 0) {
    return;
  }
  const payload = messages.map((row) => ({
    to: row.to,
    title: row.title,
    body: row.body || row.title,
    sound: row.sound ?? 'default',
    data: row.data ?? {},
  }));
  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Expo push ${response.status}: ${text.slice(0, 200)}`);
  }
}

function serviceClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) {
    throw new Error('Missing Supabase service credentials');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json(405, { ok: false, error: 'POST only' });
  }

  let input: PushBody = {};
  try {
    input = (await req.json()) as PushBody;
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON' });
  }

  try {
    const incoming = asMessages(input.messages);
    if (incoming.length > 0) {
      await sendExpo(incoming);
      if (input.notification_id) {
        const supabase = serviceClient();
        await supabase
          .from('notifications')
          .update({ pushed_at: new Date().toISOString() })
          .eq('id', input.notification_id)
          .is('pushed_at', null);
      }
      return json(200, { ok: true, sent: incoming.length });
    }

    const supabase = serviceClient();
    let userIds = [...new Set((input.user_ids ?? []).filter(Boolean))];
    let title = input.title?.trim() ?? '';
    let body = input.body?.trim() || title;
    let data = input.data ?? {};

    if (input.notification_id) {
      const { data: row, error } = await supabase
        .from('notifications')
        .select('id, user_id, type, title, body, data, actor_id, pushed_at')
        .eq('id', input.notification_id)
        .maybeSingle();
      if (error) {
        throw error;
      }
      if (!row) {
        return json(404, { ok: false, error: 'Notification not found' });
      }
      if (row.pushed_at) {
        return json(200, { ok: true, skipped: 'already_pushed' });
      }
      userIds = [row.user_id];
      title = row.title;
      body = (row.body as string | null)?.trim() || row.title;
      const extra = (row.data ?? {}) as Record<string, unknown>;
      data = {
        ...extra,
        type: row.type,
        notification_id: row.id,
        challengeId: extra.challengeId ?? extra.challenge_id,
        postId: extra.postId ?? extra.post_id,
        actorId: extra.actorId ?? extra.actor_id ?? row.actor_id,
      };
    }

    if (!title || userIds.length === 0) {
      return json(400, { ok: false, error: 'Need messages, notification_id, or user_ids + title' });
    }

    const { data: tokens, error: tokenError } = await supabase
      .from('push_tokens')
      .select('token, user_id')
      .in('user_id', userIds);
    if (tokenError) {
      throw tokenError;
    }

    const messages: ExpoMessage[] = (tokens ?? []).map((row) => ({
      to: row.token,
      title,
      body,
      sound: 'default',
      data,
    }));
    await sendExpo(messages);

    if (input.notification_id) {
      await supabase
        .from('notifications')
        .update({ pushed_at: new Date().toISOString() })
        .eq('id', input.notification_id)
        .is('pushed_at', null);
    }

    return json(200, { ok: true, sent: messages.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Push failed';
    console.error('[push-notify]', message);
    return json(200, { ok: false, error: message });
  }
});
