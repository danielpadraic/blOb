import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH = 100;

type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  sound?: string;
  channelId?: string;
  data?: Record<string, unknown>;
};

type PushBody = {
  notification_id?: string;
  notification_ids?: string[];
  user_ids?: string[];
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
};

type ExpoTicket = {
  status?: string;
  id?: string;
  message?: string;
  details?: { error?: string };
};

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

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function asIdList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((row) => String(row ?? '').trim()).filter(Boolean))];
}

async function hookKey(supabase: SupabaseClient): Promise<string | null> {
  const { data, error } = await supabase.from('push_hook_config').select('hook_key').eq('id', 1).maybeSingle();
  if (error) {
    throw error;
  }
  const key = asString((data as { hook_key?: string } | null)?.hook_key);
  return key ?? null;
}

function authorized(req: Request, expected: string): boolean {
  const header = req.headers.get('x-blob-push-key')?.trim() || '';
  const bearer = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim() || '';
  return Boolean(expected) && (header === expected || bearer === expected);
}

async function sendExpo(messages: ExpoMessage[]): Promise<ExpoTicket[]> {
  const tickets: ExpoTicket[] = [];
  for (let i = 0; i < messages.length; i += EXPO_BATCH) {
    const chunk = messages.slice(i, i + EXPO_BATCH);
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(chunk),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`Expo push ${response.status}: ${text.slice(0, 240)}`);
    }
    let parsed: { data?: ExpoTicket[] } = {};
    try {
      parsed = JSON.parse(text) as { data?: ExpoTicket[] };
    } catch {
      throw new Error(`Expo push returned non-JSON: ${text.slice(0, 120)}`);
    }
    const rows = Array.isArray(parsed.data) ? parsed.data : [];
    tickets.push(...rows);
  }
  return tickets;
}

async function dropDeadTokens(
  supabase: SupabaseClient,
  tokens: string[],
  tickets: ExpoTicket[],
): Promise<number> {
  const dead: string[] = [];
  tickets.forEach((ticket, index) => {
    const error = ticket?.details?.error || '';
    if (ticket?.status === 'error') {
      console.error('[push-notify] ticket', ticket.message || error || 'error');
    }
    if (error === 'DeviceNotRegistered' && tokens[index]) {
      dead.push(tokens[index]);
    }
  });
  if (dead.length === 0) {
    return 0;
  }
  const { error } = await supabase.from('push_tokens').delete().in('token', dead);
  if (error) {
    console.error('[push-notify] token delete', error.message);
    return 0;
  }
  return dead.length;
}

async function stampPushed(supabase: SupabaseClient, ids: string[]): Promise<void> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) {
    return;
  }
  await supabase
    .from('notifications')
    .update({ pushed_at: new Date().toISOString() })
    .in('id', unique)
    .is('pushed_at', null);
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
    const supabase = serviceClient();
    const expected = await hookKey(supabase);
    if (!expected || !authorized(req, expected)) {
      return json(401, { ok: false, error: 'Unauthorized' });
    }

    let userIds = asIdList(input.user_ids);
    let title = asString(input.title) ?? '';
    let body = asString(input.body) || title;
    let data = (input.data ?? {}) as Record<string, unknown>;
    let notificationIds = asIdList(input.notification_ids);
    if (input.notification_id) {
      notificationIds = [...new Set([...notificationIds, input.notification_id])];
    }

    if (notificationIds.length === 1 && userIds.length === 0) {
      const { data: row, error } = await supabase
        .from('notifications')
        .select('id, user_id, type, title, body, data, actor_id, pushed_at')
        .eq('id', notificationIds[0])
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
      body = asString(row.body) || row.title;
      const extra = (row.data ?? {}) as Record<string, unknown>;
      data = {
        ...extra,
        type: row.type,
        notification_id: row.id,
        challengeId: extra.challengeId ?? extra.challenge_id,
        postId: extra.postId ?? extra.post_id,
        commentId: extra.commentId ?? extra.comment_id,
        actorId: extra.actorId ?? extra.actor_id ?? row.actor_id,
        url: extra.url ?? extra.href,
      };
    }

    if (!title || userIds.length === 0) {
      return json(400, { ok: false, error: 'Need notification_id or user_ids + title' });
    }

    const { data: tokenRows, error: tokenError } = await supabase
      .from('push_tokens')
      .select('token, user_id')
      .in('user_id', userIds);
    if (tokenError) {
      throw tokenError;
    }

    const tokens = (tokenRows ?? []).map((row) => row.token).filter(Boolean);
    const messages: ExpoMessage[] = (tokenRows ?? []).map((row) => ({
      to: row.token,
      title,
      body,
      sound: 'default',
      channelId: 'alerts',
      data: {
        ...data,
        type: data.type,
        challengeId: data.challengeId ?? data.challenge_id,
        postId: data.postId ?? data.post_id,
        commentId: data.commentId ?? data.comment_id,
        url: data.url ?? data.href,
      },
    }));

    const tickets = await sendExpo(messages);
    const dropped = await dropDeadTokens(supabase, tokens, tickets);
    await stampPushed(supabase, notificationIds);

    return json(200, { ok: true, sent: messages.length, dropped });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Push failed';
    console.error('[push-notify]', message);
    return json(500, { ok: false, error: message });
  }
});
