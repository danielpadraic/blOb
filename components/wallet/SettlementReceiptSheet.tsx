import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { formatCash } from '@/lib/currency';
import { THEME, themeShadow } from '@/lib/theme';
import { receiptHoldLine, settlementChipLabel, type SettlementRow } from '@/lib/wallet/settlement';
import { formatDate } from '@/utils/format';

type Props = {
  row: SettlementRow | null;
  onClose: () => void;
};

function money(row: SettlementRow, amount: number): string {
  return String(row.currency ?? '') === 'bucks' ? formatCash(amount) : String(Math.round(amount));
}

export function SettlementReceiptSheet({ row, onClose }: Props) {
  const windowLine =
    row?.startsAt && row.endsAt
      ? `${formatDate(row.startsAt, 'MMM d')} – ${formatDate(row.endsAt, 'MMM d, yyyy')}`
      : null;

  return (
    <ChromeOverlay visible={Boolean(row)} onClose={onClose} align="center" dim="heavy" zIndex={80}>
      {row ? (
        <View
          style={{
            marginHorizontal: 16,
            backgroundColor: THEME.surface,
            borderRadius: THEME.radius,
            padding: 16,
            ...themeShadow('card'),
          }}>
          <AppText className="text-[20px] font-extrabold" style={{ color: THEME.textPrimary }}>
            {row.title}
          </AppText>
          <AppText className="mt-1 text-[14px]" style={{ color: THEME.textMuted }}>
            {row.kind ?? 'Prize'}
            {windowLine ? ` · ${windowLine}` : ''}
          </AppText>
          {row.place ? (
            <AppText className="mt-2 text-[14px]" style={{ color: THEME.textPrimary }}>
              Place {row.place}
            </AppText>
          ) : null}
          <View className="mt-4" style={{ gap: 6 }}>
            <AppText className="text-[14px]" style={{ color: THEME.textPrimary }}>
              Gross {money(row, row.gross)}
            </AppText>
            <AppText className="text-[14px]" style={{ color: THEME.textPrimary }}>
              Platform fee {money(row, row.fee)}
            </AppText>
            <AppText className="text-[16px] font-bold" style={{ color: THEME.textPrimary }}>
              Net {money(row, row.net)}
            </AppText>
          </View>
          <AppText className="mt-3 text-[13px] font-semibold" style={{ color: THEME.accent }}>
            {settlementChipLabel(row.chip)}
          </AppText>
          <AppText className="mt-2 text-[14px] leading-5" style={{ color: THEME.textMuted }}>
            {receiptHoldLine(row)}
          </AppText>
          <View className="mt-4">
            <Button title="Close" size="lg" onPress={onClose} />
          </View>
        </View>
      ) : null}
    </ChromeOverlay>
  );
}
