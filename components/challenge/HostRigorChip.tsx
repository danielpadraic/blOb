import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { hostRigorLabel, hostRigorOf } from '@/lib/hostRigor';
import { THEME } from '@/lib/theme';

export function HostRigorChip({
  hostRigor,
  tone = 'light',
}: {
  hostRigor?: string | null;
  tone?: 'light' | 'dark';
}) {
  const label = hostRigorLabel(hostRigorOf({ host_rigor: hostRigor }));
  const dark = tone === 'dark';
  return (
    <View
      accessibilityLabel={label}
      style={{
        minHeight: 22,
        paddingHorizontal: 8,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: dark ? 'rgba(16, 19, 18, 0.46)' : THEME.surface,
        borderWidth: 1,
        borderColor: dark ? 'rgba(255,255,255,0.18)' : THEME.border,
      }}>
      <AppText
        className="text-[11px] font-semibold"
        style={{
          color: dark ? THEME.primaryForeground : THEME.textPrimary,
          includeFontPadding: false,
          lineHeight: 14,
        }}>
        {label}
      </AppText>
    </View>
  );
}
