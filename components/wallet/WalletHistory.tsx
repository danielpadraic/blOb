import { Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { StakeAmount } from '@/components/currency/CurrencyMark';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { supabase } from '@/lib/supabase';
import { asWalletReceiptRow, walletReceiptHref, type WalletReceiptRow } from '@/lib/walletReceipt';
import { formatDate } from '@/utils/format';

type LedgerRow = {
  id: string;
  challenge_id: string | null;
  currency: string | null;
  amount: number | null;
  entry_type: string | null;
  reason: string | null;
  created_at: string;
};

export function WalletHistory() {
  const { user } = useAuth();
  const router = useRouter();
  const wallet = useWallet();
  const query = useQuery({
    queryKey: ['wallet-ledger', user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<WalletReceiptRow[]> => {
      const { data, error } = await supabase
        .from('wallet_ledger')
        .select('id, challenge_id, currency, amount, entry_type, reason, created_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) {
        throw error;
      }
      const rows = (data ?? []) as LedgerRow[];
      const challengeIds = [...new Set(rows.map((row) => row.challenge_id).filter(Boolean))] as string[];
      const titles = new Map<string, { title: string | null; task: string | null }>();
      const places = new Map<string, number>();
      if (challengeIds.length > 0) {
        const [named, payouts] = await Promise.all([
          supabase.from('challenges').select('id, title, task').in('id', challengeIds),
          supabase
            .from('challenge_payouts')
            .select('challenge_id, place, amount')
            .eq('user_id', user!.id)
            .in('challenge_id', challengeIds),
        ]);
        for (const row of named.data ?? []) {
          titles.set(row.id, { title: row.title ?? null, task: row.task ?? null });
        }
        for (const row of payouts.data ?? []) {
          if (row.challenge_id && Number(row.place) > 0) {
            places.set(row.challenge_id, Number(row.place));
          }
        }
      }
      return rows.map((row) =>
        asWalletReceiptRow({
          ...row,
          title: row.challenge_id ? titles.get(row.challenge_id)?.title : null,
          task: row.challenge_id ? titles.get(row.challenge_id)?.task : null,
          place: row.challenge_id ? places.get(row.challenge_id) ?? null : null,
        }),
      );
    },
  });

  if (!query.data?.length) {
    return null;
  }

  return (
    <View className="mt-6">
      <AppText className="text-[12px] font-bold uppercase tracking-widest text-charcoal">
        Receipts
      </AppText>
      <View className="mt-2 gap-2">
        {query.data.map((row) => {
          const href = walletReceiptHref(row.challengeId);
          return (
            <Pressable
              key={row.id}
              disabled={!href}
              onPress={() => {
                if (!href) {
                  return;
                }
                wallet.closeWallet();
                setTimeout(() => {
                  router.push(href);
                }, 60);
              }}
              style={{ minHeight: 44 }}>
              <Card className="flex-row items-center gap-3 py-3">
                <View className="flex-1">
                  <AppText className="text-[14px] font-bold text-charcoal">{row.headline}</AppText>
                  <AppText className="text-[12px] text-muted">{formatDate(row.createdAt, 'MMM d')}</AppText>
                </View>
                <StakeAmount
                  amount={row.amount}
                  currency={row.currency}
                  size={14}
                  zeroAsNumber
                  textClassName="text-[14px] font-bold text-charcoal"
                />
              </Card>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
