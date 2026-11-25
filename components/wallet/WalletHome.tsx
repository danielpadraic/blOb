import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import { CashOutReadinessBanner } from '@/components/wallet/CashOutReadinessBanner';
import { SettlementReceiptSheet } from '@/components/wallet/SettlementReceiptSheet';
import { SettlementStatusCard } from '@/components/wallet/SettlementStatusCard';
import { TransactionRow } from '@/components/wallet/TransactionRow';
import { MascotState } from '@/components/mascot/MascotState';
import { AppText } from '@/components/ui/AppText';
import { useMyProfile } from '@/hooks/useProfile';
import { useWalletSettlements } from '@/hooks/useWalletSettlements';
import { hasPayoutAddress } from '@/lib/payoutAddress';
import { THEME } from '@/lib/theme';
import { cashOutSummary, type SettlementRow } from '@/lib/wallet/settlement';

type Props = {
  limit?: number;
  onBeforeNavigate?: () => void;
};

export function WalletHome({ limit, onBeforeNavigate }: Props) {
  const router = useRouter();
  const { profile } = useMyProfile();
  const query = useWalletSettlements();
  const [open, setOpen] = useState<SettlementRow | null>(null);
  const rows = query.data ?? [];
  const shown = typeof limit === 'number' ? rows.slice(0, limit) : rows;
  const summary = cashOutSummary(rows);

  return (
    <View>
      <SettlementStatusCard available={summary.available} pending={summary.pending} />
      <CashOutReadinessBanner
        bucks={profile?.bucks}
        pending={summary.pending}
        hasAddress={hasPayoutAddress(profile)}
        onBeforeNavigate={onBeforeNavigate}
      />
      <View className="mt-5 flex-row items-center justify-between">
        <AppText className="text-[12px] font-bold uppercase tracking-widest" style={{ color: THEME.textPrimary }}>
          Settlements
        </AppText>
        {typeof limit === 'number' && rows.length > limit ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              onBeforeNavigate?.();
              router.push('/wallet/settlements');
            }}
            style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText className="text-[14px] font-semibold" style={{ color: THEME.accent }}>
              See all
            </AppText>
          </Pressable>
        ) : null}
      </View>
      {query.isLoading ? (
        <MascotState kind="loading" title="Loading your wallet" compact />
      ) : rows.length === 0 ? (
        <MascotState
          kind="empty"
          title="No settlements yet"
          body="When a challenge pays you, it shows up here."
          compact
        />
      ) : (
        <View className="mt-2" style={{ gap: 8 }}>
          {shown.map((row) => (
            <TransactionRow key={row.id} row={row} onPress={setOpen} />
          ))}
        </View>
      )}
      <SettlementReceiptSheet row={open} onClose={() => setOpen(null)} />
    </View>
  );
}
