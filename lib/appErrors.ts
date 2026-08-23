import { supabase } from '@/lib/supabase';

const SENSITIVE =
  /token|password|secret|authorization|apikey|api_key|refresh|jwt|body_fat|weight|height_cm|fitness_profile|current_weight|goal_weight/i;

function asRecord(error: unknown): Record<string, unknown> | null {
  if (!error || typeof error !== 'object') {
    return null;
  }
  return error as Record<string, unknown>;
}

export function extractPostgrestCode(error: unknown): string | null {
  const record = asRecord(error);
  if (!record) {
    return null;
  }
  const code = record.code;
  if (typeof code === 'string' && code.trim()) {
    return code.trim();
  }
  const nested = asRecord(record.error);
  if (nested && typeof nested.code === 'string' && nested.code.trim()) {
    return nested.code.trim();
  }
  return null;
}

function extractMessage(error: unknown): string {
  const record = asRecord(error);
  if (record && typeof record.message === 'string' && record.message.trim()) {
    return record.message.trim().slice(0, 500);
  }
  if (error instanceof Error && error.message) {
    return error.message.trim().slice(0, 500);
  }
  return String(error ?? '').slice(0, 500);
}

function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) {
    return value ?? null;
  }
  if (typeof value === 'string') {
    if (value.length > 400) {
      return `${value.slice(0, 400)}…`;
    }
    if (/^eyJ/.test(value) || SENSITIVE.test(value)) {
      return '[redacted]';
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => scrubValue(item, depth + 1));
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE.test(key)) {
        out[key] = '[redacted]';
        continue;
      }
      out[key] = scrubValue(item, depth + 1);
    }
    return out;
  }
  return value;
}

export type ReportAppErrorInput = {
  route: string;
  error?: unknown;
  code?: string | null;
  message?: string | null;
  payload?: Record<string, unknown> | null;
};

let lastAppErrorCode: string | null = null;

export function getLastAppErrorCode(): string | null {
  return lastAppErrorCode;
}

/** Fire-and-forget. Never throws. Never stores tokens, passwords, or body metrics. */
export function reportAppError(input: ReportAppErrorInput): void {
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const userId = data.session?.user?.id ?? null;
      const code = input.code ?? extractPostgrestCode(input.error) ?? null;
      if (code) {
        lastAppErrorCode = code;
      }
      const message = (input.message ?? extractMessage(input.error)).slice(0, 500);
      const payload = scrubValue({
        ...(input.payload ?? {}),
        details: asRecord(input.error)?.details ?? null,
        hint: asRecord(input.error)?.hint ?? null,
      });
      await supabase.from('app_errors').insert({
        user_id: userId,
        route: input.route.slice(0, 200),
        code,
        message,
        payload: (payload && typeof payload === 'object' ? payload : {}) as Record<string, unknown>,
      });
    } catch {
      // Admin log must never block the user path.
    }
  })();
}

export function pingAppOpen(): void {
  void (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session?.user?.id) {
        return;
      }
      await supabase.rpc('ping_app_open');
    } catch {
      // Pulse DAU is best-effort.
    }
  })();
}
