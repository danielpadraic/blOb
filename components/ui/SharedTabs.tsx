import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

export type SharedTabOption<T extends string> = {
  value: T;
  label: string;
};

export function SharedTabs<T extends string>({
  value,
  onChange,
  options,
  accessibilityLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly SharedTabOption<T>[];
  accessibilityLabel: string;
}) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      className="flex-row"
      style={{
        borderBottomWidth: 1,
        borderBottomColor: THEME.border,
      }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            className="min-h-[44px] flex-1 items-center justify-center"
            style={{ paddingHorizontal: 4 }}>
            <AppText
              className="text-center text-[13px] font-semibold"
              numberOfLines={1}
              style={{ color: selected ? THEME.accent : THEME.textMuted }}>
              {option.label}
            </AppText>
            <View
              style={{
                marginTop: 8,
                height: 2,
                width: '100%',
                borderRadius: 999,
                backgroundColor: selected ? THEME.accent : 'transparent',
              }}
            />
          </Pressable>
        );
      })}
    </View>
  );
}
