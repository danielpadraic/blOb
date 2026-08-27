import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';
import { dismissKeyboard } from '@/utils/keyboard';

type SegmentOption<T extends string> = {
  value: T;
  label: string;
};

type SegmentedControlProps<T extends string> = {
  value: T | null;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  accessibilityLabel?: string;
};

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  accessibilityLabel,
}: SegmentedControlProps<T>) {
  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={accessibilityLabel}
      className="flex-row p-1"
      style={{
        backgroundColor: THEME.border,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: THEME.border,
      }}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              dismissKeyboard();
              onChange(option.value);
            }}
            className="min-h-[44px] flex-1 items-center justify-center px-2"
            style={{
              backgroundColor: selected ? THEME.primary : 'transparent',
              borderRadius: 999,
            }}>
            <AppText
              className="text-center text-sm font-semibold"
              style={{
                color: selected ? THEME.primaryForeground : THEME.textPrimary,
                includeFontPadding: false,
                textAlignVertical: 'center',
                lineHeight: 16,
              }}>
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}
