import { supabase } from '@/lib/supabase';
import type { AppErrorRow } from '@/lib/types';

export type AdminRange = 'today' | '7d';

export type AdminPulse = {
  range: AdminRange;
  start: string;
  accounts: number;
  dau: number;
  joins: number;
  checkins: number;
  filling: number;
  live: number;
  errors: number;
};

export type AdminPulseMetric =
  | 'accounts'
  | 'dau'
  | 'joins'
  | 'checkins'
  | 'filling'
  | 'live'
  | 'errors';

export type AdminPulseRow = {
  id?: string | null;
  user_id?: string | null;
  username?: string | null;
  display_name?: string | null;
  challenge_id?: string | null;
  title?: string | null;
  code?: string | null;
  route?: string | null;
  message?: string | null;
  at?: string | null;
};

export type AdminErrorView = AppErrorRow & {
  username?: string | null;
};

function asNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function fetchAdminPulse(range: AdminRange): Promise<AdminPulse> {
  const { data, error } = await supabase.rpc('admin_pulse', { p_range: range });
  if (error) {
    throw error;
  }
  const row = (data ?? {}) as Record<string, unknown>;
  return {
    range: row.range === '7d' ? '7d' : 'today',
    start: String(row.start ?? ''),
    accounts: asNumber(row.accounts),
    dau: asNumber(row.dau),
    joins: asNumber(row.joins),
    checkins: asNumber(row.checkins),
    filling: asNumber(row.filling),
    live: asNumber(row.live),
    errors: asNumber(row.errors),
  };
}

export async function fetchAdminPulseList(
  metric: AdminPulseMetric,
  range: AdminRange,
): Promise<AdminPulseRow[]> {
  const { data, error } = await supabase.rpc('admin_pulse_list', {
    p_metric: metric,
    p_range: range,
  });
  if (error) {
    throw error;
  }
  return Array.isArray(data) ? (data as AdminPulseRow[]) : [];
}

export async function fetchAdminErrors(): Promise<AdminErrorView[]> {
  const { data, error } = await supabase
    .from('app_errors')
    .select('id, user_id, route, code, message, payload, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) {
    throw error;
  }
  const rows = (data ?? []) as AppErrorRow[];
  const ids = [...new Set(rows.map((row) => row.user_id).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const profiles = await supabase.from('profiles').select('id, username').in('id', ids);
    for (const profile of profiles.data ?? []) {
      const row = profile as { id: string; username?: string | null };
      if (row.username) {
        names.set(row.id, row.username);
      }
    }
  }
  return rows.map((row) => ({
    ...row,
    username: row.user_id ? names.get(row.user_id) ?? null : null,
  }));
}
