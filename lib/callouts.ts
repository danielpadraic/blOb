import { addDays, addHours } from 'date-fns';

import { asWalletCurrency } from '@/lib/currency';
import { PUBLIC_PROFILE_COLUMNS } from '@/lib/constants';
import { supabase } from '@/lib/supabase';
import type { Callout, PublicProfile, WalletCurrency } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

const CALLOUT_COLUMNS =
  'id, challenger_id, opponent_id, currency, stake_amount, win_condition, deadline, status, held, challenger_pick, opponent_pick, winner_id, challenger_cancel_at, opponent_cancel_at, created_at, updated_at';

export type CalloutDeadlinePreset = '24h' | '3d' | '7d';

export function asCallout(row: Callout): Callout {
  return {
    ...row,
    currency: asWalletCurrency(row.currency),
    stake_amount: Number(row.stake_amount),
    held: Boolean(row.held),
    win_condition: row.win_condition ?? '',
  };
}

function asCalloutResult(data: unknown): Callout {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('The call-out finished but we couldn’t load it.');
  }
  return asCallout(row as Callout);
}

export function deadlineFromPreset(preset: CalloutDeadlinePreset): string {
  const now = new Date();
  if (preset === '24h') {
    return addHours(now, 24).toISOString();
  }
  if (preset === '3d') {
    return addDays(now, 3).toISOString();
  }
  return addDays(now, 7).toISOString();
}

export async function fetchMyCallouts(): Promise<Callout[]> {
  const { data, error } = await supabase
    .from('callouts')
    .select(CALLOUT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(40);
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return ((data ?? []) as Callout[]).map(asCallout);
}

export async function fetchCallout(id: string): Promise<Callout> {
  const { data, error } = await supabase
    .from('callouts')
    .select(CALLOUT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  if (!data) {
    throw new Error('Call-out not found');
  }
  return asCallout(data as Callout);
}

export async function createCallout(input: {
  opponentId: string;
  amount: number;
  currency: WalletCurrency;
  winCondition: string;
  deadline: string;
}): Promise<Callout> {
  const { data, error } = await supabase.rpc('create_callout', {
    p_opponent_id: input.opponentId,
    p_amount: input.amount,
    p_currency: input.currency,
    p_win_condition: input.winCondition,
    p_deadline: input.deadline,
  });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return asCalloutResult(data);
}

export async function acceptCallout(id: string): Promise<Callout> {
  const { data, error } = await supabase.rpc('accept_callout', { p_callout_id: id });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return asCalloutResult(data);
}

export async function declineCallout(id: string): Promise<Callout> {
  const { data, error } = await supabase.rpc('decline_callout', { p_callout_id: id });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return asCalloutResult(data);
}

export async function submitCalloutResult(id: string, winnerId: string): Promise<Callout> {
  const { data, error } = await supabase.rpc('submit_callout_result', {
    p_callout_id: id,
    p_winner_id: winnerId,
  });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return asCalloutResult(data);
}

export async function cancelCallout(id: string): Promise<Callout> {
  const { data, error } = await supabase.rpc('cancel_callout', { p_callout_id: id });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return asCalloutResult(data);
}

export async function fetchCalloutProfiles(ids: string[]): Promise<PublicProfile[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from('profiles')
    .select(PUBLIC_PROFILE_COLUMNS)
    .in('id', unique);
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return (data ?? []) as PublicProfile[];
}

export async function findProfileByUsername(username: string): Promise<PublicProfile | null> {
  const handle = username.trim().replace(/^@/, '').toLowerCase();
  if (handle.length < 2) {
    return null;
  }
  const { data, error } = await supabase
    .from('profiles')
    .select(PUBLIC_PROFILE_COLUMNS)
    .eq('username', handle)
    .maybeSingle();
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return (data as PublicProfile | null) ?? null;
}

export function calloutStatusLabel(status: Callout['status']): string {
  switch (status) {
    case 'pending':
      return 'Waiting to accept';
    case 'active':
      return 'Stakes held';
    case 'resolving':
      return 'Waiting on both picks';
    case 'settled':
      return 'Settled';
    case 'disputed':
      return 'Disputed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return status;
  }
}
