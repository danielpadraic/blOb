import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  minHeight?: number;
};

export function Chip({ label, selected, onPress, minHeight = 36 }: ChipProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      className="items-center justify-center rounded-full px-4"
      style={{
        backgroundColor: selected ? THEME.accent : THEME.surface,
        borderWidth: 1,
        borderColor: selected ? THEME.accent : THEME.border,
        minHeight,
        flexShrink: 0,
      }}>
      <AppText
        className="text-center text-sm font-semibold capitalize"
        numberOfLines={1}
        style={{
          color: selected ? THEME.accentForeground : THEME.textPrimary,
          includeFontPadding: false,
          textAlignVertical: 'center',
          lineHeight: 16,
          flexShrink: 0,
        }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-2">{children}</View>;
}
