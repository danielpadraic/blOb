import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import type { CounterCardModel } from '@/lib/counter/card';
import { THEME, themeShadow } from '@/lib/theme';

export function CounterRecapCard({ card }: { card: CounterCardModel }) {
  return (
    <View
      style={{
        backgroundColor: THEME.surface,
        borderRadius: THEME.radius,
        borderWidth: 1,
        borderColor: THEME.border,
        padding: 16,
        gap: 10,
        ...themeShadow('card'),
      }}>
      <AppText style={{ fontSize: 18, fontWeight: '800', color: THEME.textPrimary }}>{card.title}</AppText>
      <AppText style={{ fontSize: 13, color: THEME.textMuted }}>{card.dateLine}</AppText>
      {card.rows.map((row) => (
        <View
          key={`${row.name}-${row.value}`}
          style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <AppText style={{ flex: 1, fontSize: 15, fontWeight: '700', color: THEME.textPrimary }}>{row.name}</AppText>
          <AppText style={{ fontSize: 20, fontWeight: '800', color: THEME.textPrimary }}>{row.value}</AppText>
        </View>
      ))}
      <AppText style={{ marginTop: 4, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: THEME.accent }}>
        blOb
      </AppText>
    </View>
  );
}
