import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { formatCash } from '@/lib/currency';
import { THEME, themeShadow } from '@/lib/theme';
import { availableHeadline } from '@/lib/wallet/settlement';

type Props = {
  available: number;
  pending: number;
};

export function SettlementStatusCard({ available, pending }: Props) {
  return (
    <View
      style={{
        backgroundColor: THEME.surface,
        borderRadius: THEME.radius,
        borderWidth: 1,
        borderColor: THEME.border,
        padding: 16,
        ...themeShadow('card'),
      }}>
      <AppText className="text-[12px] font-bold uppercase tracking-widest" style={{ color: THEME.textMuted }}>
        Available to cash out
      </AppText>
      <AppText className="mt-1 text-[28px] font-extrabold" style={{ color: THEME.textPrimary }}>
        {availableHeadline(available, pending)}
      </AppText>
      <AppText className="mt-2 text-[14px]" style={{ color: THEME.textMuted }}>
        Pending settlements · {formatCash(pending)}
      </AppText>
    </View>
  );
}
