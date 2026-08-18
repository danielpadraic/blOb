import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

type CreditChipProps = {
  credits: number;
};

export function CreditChip({ credits }: CreditChipProps) {
  const amount = Number(credits ?? 0).toFixed(2);

  return (
    <View
      className="flex-row items-center justify-between px-4 py-3.5"
      style={{
        backgroundColor: THEME.primary,
        borderRadius: THEME.radius,
      }}>
      <AppText
        className="text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: THEME.accentBright }}>
        Wallet
      </AppText>
      <AppText className="text-[22px] font-bold" style={{ color: THEME.primaryForeground }}>
        {amount} Coins
      </AppText>
    </View>
  );
}
