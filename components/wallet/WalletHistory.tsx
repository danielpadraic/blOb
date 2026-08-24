import { Pressable, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { StakeAmount } from '@/components/currency/CurrencyMark';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useWallet } from '@/hooks/useWallet';
import { challengeDetailHref } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { ledgerReceiptLabel } from '@/lib/funding';
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
    queryFn: async (): Promise<LedgerRow[]> => {
      const { data, error } = await supabase
        .from('wallet_ledger')
        .select('id, challenge_id, currency, amount, entry_type, reason, created_at')
        .eq('user_id', user!.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) {
        throw error;
      }
      return (data ?? []) as LedgerRow[];
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
        {query.data.map((row) => (
          <Pressable
            key={row.id}
            disabled={!row.challenge_id}
            onPress={() => {
              if (!row.challenge_id) {
                return;
              }
              wallet.closeWallet();
              setTimeout(() => {
                router.push(challengeDetailHref(row.challenge_id, 'lobby', null, { tab: 'board', receipt: true }));
              }, 60);
            }}
            style={{ minHeight: 44 }}>
            <Card className="flex-row items-center gap-3 py-3">
              <View className="flex-1">
                <AppText className="text-[14px] font-bold text-charcoal">
                  {ledgerReceiptLabel(row.entry_type)}
                </AppText>
                <AppText className="text-[12px] text-muted">{formatDate(row.created_at, 'MMM d')}</AppText>
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
        ))}
      </View>
    </View>
  );
}
