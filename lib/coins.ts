import { asWalletCurrency, currencyNoun, formatWallet } from '@/lib/currency';
import { supabase } from '@/lib/supabase';
import type { CoinTransfer, PublicProfile, WalletCurrency } from '@/lib/types';
import { PUBLIC_PROFILE_COLUMNS } from '@/lib/constants';
import { getErrorMessage } from '@/utils/errors';

const MIN_TRANSFER = 0.01;
const MIN_COIN_TRANSFER = 1;
const MAX_TRANSFER = 10000;

export function normalizeCoinAmount(raw: string, currency?: string | null): number {
  const parsed = Number(String(raw).replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  if (asWalletCurrency(currency) === 'bucks') {
    return Math.round(parsed * 100) / 100;
  }
  return Math.round(parsed);
}

export function transferAmountError(
  amount: number,
  walletCredits: number,
  currency?: string | null,
  options?: { unlimited?: boolean },
): string | null {
  const noun = currencyNoun(currency);
  const minimum = asWalletCurrency(currency) === 'bucks' ? MIN_TRANSFER : MIN_COIN_TRANSFER;
  if (amount < minimum) {
    return `Send at least ${minimum} ${noun}.`;
  }
  if (options?.unlimited) {
    return null;
  }
  if (amount > MAX_TRANSFER) {
    return `Keep a transfer at 10,000 ${noun} or less.`;
  }
  if (amount > walletCredits) {
    return `You have ${formatWallet(walletCredits, currency)}.`;
  }
  return null;
}

export async function sendCoins(
  toUserId: string,
  amount: number,
  note?: string | null,
): Promise<CoinTransfer> {
  const { data, error } = await supabase.rpc('send_coins', {
    p_to_user_id: toUserId,
    p_amount: amount,
    p_note: note?.trim() ? note.trim() : null,
  });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('The transfer finished but we couldn’t load the receipt.');
  }
  return {
    ...(row as CoinTransfer),
    amount: Number((row as CoinTransfer).amount),
    currency: asWalletCurrency((row as CoinTransfer).currency ?? 'coins'),
  };
}

export async function transferFunds(
  recipientId: string,
  amount: number,
  currency: WalletCurrency = 'coins',
): Promise<CoinTransfer> {
  const { data, error } = await supabase.rpc('transfer_funds', {
    p_recipient_id: recipientId,
    p_amount: amount,
    p_currency: asWalletCurrency(currency),
  });
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    throw new Error('The transfer finished but we couldn’t load the receipt.');
  }
  return {
    ...(row as CoinTransfer),
    amount: Number((row as CoinTransfer).amount),
    currency: asWalletCurrency((row as CoinTransfer).currency ?? currency),
  };
}

export async function transferCoins(recipientId: string, amount: number): Promise<CoinTransfer> {
  return transferFunds(recipientId, amount, 'coins');
}

export async function searchCoinRecipients(
  query: string,
  currentUserId: string,
): Promise<PublicProfile[]> {
  const term = query.trim().replace(/[%_,()]/g, '');
  if (term.length < 2) {
    return [];
  }
  const { data, error } = await supabase
    .from('profiles')
    .select(PUBLIC_PROFILE_COLUMNS)
    .or(`username.ilike.%${term}%,display_name.ilike.%${term}%`)
    .neq('id', currentUserId)
    .limit(12);
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return (data ?? []) as PublicProfile[];
}

export async function fetchCoinRecipientSuggestions(
  currentUserId: string,
): Promise<{ following: PublicProfile[]; recent: PublicProfile[] }> {
  const [followingIds, recentIds] = await Promise.all([
    fetchFollowingIds(currentUserId),
    fetchRecentRecipientIds(currentUserId),
  ]);
  const uniqueIds = [...new Set([...followingIds, ...recentIds])].filter(
    (id) => id !== currentUserId,
  );
  const profiles = await fetchPublicProfilesByIds(uniqueIds);
  const byId = new Map(profiles.map((profile) => [profile.id, profile]));
  return {
    following: followingIds
      .map((id) => byId.get(id))
      .filter((profile): profile is PublicProfile => Boolean(profile)),
    recent: recentIds
      .map((id) => byId.get(id))
      .filter((profile): profile is PublicProfile => Boolean(profile)),
  };
}

async function fetchFollowingIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('follows')
    .select('following_id')
    .eq('follower_id', userId)
    .limit(20);
  if (error) {
    console.log('[blob:coins] following lookup skipped', error.message);
    return [];
  }
  return (data ?? []).map((row) => row.following_id);
}

async function fetchRecentRecipientIds(userId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('coin_transfers')
    .select('recipient_id, created_at')
    .eq('sender_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) {
    console.log('[blob:coins] recent transfers skipped', error.message);
    return [];
  }
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const row of data ?? []) {
    if (seen.has(row.recipient_id)) {
      continue;
    }
    seen.add(row.recipient_id);
    ids.push(row.recipient_id);
    if (ids.length >= 8) {
      break;
    }
  }
  return ids;
}

async function fetchPublicProfilesByIds(ids: string[]): Promise<PublicProfile[]> {
  if (ids.length === 0) {
    return [];
  }
  const { data, error } = await supabase
    .from('profiles')
    .select(PUBLIC_PROFILE_COLUMNS)
    .in('id', ids);
  if (error) {
    throw new Error(getErrorMessage(error));
  }
  return (data ?? []) as PublicProfile[];
}
