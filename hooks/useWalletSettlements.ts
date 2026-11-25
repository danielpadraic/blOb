import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';
import { asSettlementRow, type LedgerSettlementInput, type SettlementRow } from '@/lib/wallet/settlement';

const BASIC =
  'id, challenge_id, challenge_title, currency, amount, entry_type, reason, created_at';
const EXTENDED = `${BASIC}, settlement_status, available_at, fee_cents, net_cents`;

export function useWalletSettlements() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id;

  const query = useQuery({
    queryKey: ['wallet-settlements', userId],
    enabled: Boolean(userId),
    queryFn: async (): Promise<SettlementRow[]> => {
      const first = await supabase
        .from('wallet_ledger')
        .select(EXTENDED)
        .eq('user_id', userId!)
        .order('created_at', { ascending: false })
        .limit(40);
      const missing =
        Boolean(first.error) && /settlement_status|available_at|fee_cents|net_cents|42703|pgrst204/i.test(String(first.error?.message ?? ''));
      const result = missing
        ? await supabase
            .from('wallet_ledger')
            .select(BASIC)
            .eq('user_id', userId!)
            .order('created_at', { ascending: false })
            .limit(40)
        : first;
      if (result.error) {
        throw result.error;
      }
      const rows = (result.data ?? []) as LedgerSettlementInput[];
      const challengeIds = [...new Set(rows.map((row) => String(row.challenge_id ?? '')).filter(Boolean))];
      const titles = new Map<string, { title: string | null; task: string | null; starts_at: string | null; ends_at: string | null }>();
      const places = new Map<string, number>();
      if (challengeIds.length > 0) {
        const [named, payouts] = await Promise.all([
          supabase.from('challenges').select('id, title, task, starts_at, ends_at').in('id', challengeIds),
          supabase
            .from('challenge_payouts')
            .select('challenge_id, place')
            .eq('user_id', userId!)
            .in('challenge_id', challengeIds),
        ]);
        for (const row of named.data ?? []) {
          titles.set(row.id, {
            title: row.title ?? null,
            task: row.task ?? null,
            starts_at: row.starts_at ?? null,
            ends_at: row.ends_at ?? null,
          });
        }
        for (const row of payouts.data ?? []) {
          if (row.challenge_id && Number(row.place) > 0) {
            places.set(row.challenge_id, Number(row.place));
          }
        }
      }
      return rows
        .map((row) => {
          const named = row.challenge_id ? titles.get(row.challenge_id) : null;
          return asSettlementRow({
            ...row,
            title: named?.title,
            task: named?.task,
            starts_at: named?.starts_at,
            ends_at: named?.ends_at,
            place: row.challenge_id ? places.get(row.challenge_id) ?? null : null,
          });
        })
        .filter((row): row is SettlementRow => Boolean(row));
    },
  });

  useEffect(() => {
    if (!userId) {
      return;
    }
    const channel = supabase
      .channel(`wallet-ledger-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'wallet_ledger', filter: `user_id=eq.${userId}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['wallet-settlements', userId] });
          void queryClient.invalidateQueries({ queryKey: ['profile'] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);

  return query;
}
