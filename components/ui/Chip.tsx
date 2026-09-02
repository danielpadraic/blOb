import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

type ChipProps = {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  minHeight?: number;
  lines?: number;
  excel?: boolean;
  levelUp?: boolean;
  onToggleExcel?: () => void;
  onToggleLevelUp?: () => void;
};

export function Chip({
  label,
  selected,
  onPress,
  minHeight = 36,
  lines = 1,
  excel,
  levelUp,
  onToggleExcel,
  onToggleLevelUp,
}: ChipProps) {
  const dual = Boolean(onToggleExcel || onToggleLevelUp);
  const fillSelected = selected && !dual;
  const lineCount = Math.max(1, lines);
  return (
    <View
      className="items-center justify-center rounded-full px-3"
      style={{
        backgroundColor: fillSelected ? THEME.accent : THEME.surface,
        borderWidth: 1,
        borderColor: selected ? THEME.accent : THEME.border,
        minHeight: dual && selected ? 58 : minHeight,
        width: dual ? '100%' : undefined,
        flexShrink: 0,
        paddingVertical: dual && selected ? 8 : lineCount > 1 ? 6 : 0,
      }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityState={{ selected: Boolean(selected) }}
        hitSlop={4}
        className="items-center justify-center"
        style={dual ? { width: '100%' } : undefined}>
        <AppText
          className="text-center text-sm font-semibold capitalize"
          numberOfLines={lineCount}
          style={{
            color: fillSelected ? THEME.accentForeground : THEME.textPrimary,
            includeFontPadding: false,
            textAlignVertical: 'center',
            lineHeight: 16,
            flexShrink: 0,
          }}>
          {label}
        </AppText>
      </Pressable>
      {dual && selected ? (
        <View className="mt-1 flex-row gap-1">
          <Mark label="Excel" on={Boolean(excel)} onPress={onToggleExcel} />
          <Mark label="Level up" on={Boolean(levelUp)} onPress={onToggleLevelUp} />
        </View>
      ) : null}
    </View>
  );
}

function Mark({
  label,
  on,
  onPress,
}: {
  label: string;
  on: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      hitSlop={4}
      style={{
        minHeight: 22,
        paddingHorizontal: 8,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: on ? THEME.accent : 'transparent',
        borderWidth: 1,
        borderColor: on ? THEME.accent : THEME.border,
      }}>
      <AppText
        className="text-center text-[10px] font-semibold"
        style={{
          color: on ? THEME.accentForeground : THEME.textMuted,
          includeFontPadding: false,
          lineHeight: 12,
        }}>
        {label}
      </AppText>
    </Pressable>
  );
}

export function ChipRow({ children }: { children: ReactNode }) {
  return <View className="flex-row flex-wrap gap-2">{children}</View>;
}
