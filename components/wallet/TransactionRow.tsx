import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { formatCash } from '@/lib/currency';
import { THEME, themeShadow } from '@/lib/theme';
import { settlementChipLabel, type SettlementRow } from '@/lib/wallet/settlement';
import { formatRelative } from '@/utils/format';

type Props = {
  row: SettlementRow;
  onPress: (row: SettlementRow) => void;
};

export function TransactionRow({ row, onPress }: Props) {
  const money = String(row.currency ?? '') === 'bucks';
  const amount = money ? formatCash(row.net) : String(Math.round(row.net));

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${row.title} ${row.kind ?? 'Prize'}`}
      onPress={() => onPress(row)}
      style={{ minHeight: 44 }}>
      <View
        style={{
          backgroundColor: THEME.surface,
          borderRadius: THEME.radius,
          borderWidth: 1,
          borderColor: THEME.border,
          paddingHorizontal: 14,
          paddingVertical: 12,
          ...themeShadow('card'),
        }}>
        <View className="flex-row items-start justify-between" style={{ gap: 8 }}>
          <AppText className="flex-1 text-[15px] font-bold" style={{ color: THEME.textPrimary }}>
            {row.title}
          </AppText>
          <AppText className="text-[15px] font-extrabold" style={{ color: THEME.textPrimary }}>
            {amount}
          </AppText>
        </View>
        <AppText className="mt-1 text-[13px]" style={{ color: THEME.textMuted }}>
          {row.kind ?? 'Prize'} · Fee {money ? formatCash(row.fee) : String(Math.round(row.fee))} · Net {amount}
        </AppText>
        <View className="mt-2 flex-row items-center justify-between">
          <View
            style={{
              backgroundColor: THEME.accentSoft,
              borderRadius: 999,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}>
            <AppText className="text-[12px] font-semibold" style={{ color: THEME.accent }}>
              {settlementChipLabel(row.chip)}
            </AppText>
          </View>
          <AppText className="text-[12px]" style={{ color: THEME.textMuted }}>
            {formatRelative(row.createdAt)}
          </AppText>
        </View>
      </View>
    </Pressable>
  );
}
