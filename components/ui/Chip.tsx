import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
};

export function Chip({ label, selected, onPress }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      className="items-center justify-center rounded-full px-4"
      style={{
        backgroundColor: selected ? THEME.accentSoft : THEME.surface,
        borderWidth: 1,
        borderColor: selected ? THEME.accent : THEME.border,
        minHeight: 36,
      }}>
      <AppText
        className="text-center text-sm font-semibold capitalize"
        style={{
          color: selected ? THEME.accent : THEME.textPrimary,
          includeFontPadding: false,
          textAlignVertical: 'center',
          lineHeight: 16,
        }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-2">{children}</View>;
}
