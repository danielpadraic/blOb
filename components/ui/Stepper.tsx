import { Pressable, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

type StepperProps = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  accessibilityLabel?: string;
};

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 10_000,
  step = 1,
  accessibilityLabel,
}: StepperProps) {
  const safe = Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

  function bump(delta: number) {
    onChange(Math.min(max, Math.max(min, safe + delta)));
  }

  return (
    <View
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={{ min, max, now: safe }}
      className="flex-row items-center"
      style={{
        backgroundColor: THEME.surface,
        borderWidth: 1,
        borderColor: THEME.border,
        borderRadius: 999,
        padding: 4,
      }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease"
        onPress={() => bump(-step)}
        disabled={safe <= min}
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: THEME.background }}>
        <AppText className="text-[18px] font-bold text-charcoal">−</AppText>
      </Pressable>
      <AppText className="min-w-[56px] text-center text-[16px] font-extrabold text-charcoal">
        {safe}
      </AppText>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase"
        onPress={() => bump(step)}
        disabled={safe >= max}
        className="h-10 w-10 items-center justify-center rounded-full"
        style={{ backgroundColor: THEME.background }}>
        <AppText className="text-[18px] font-bold text-charcoal">+</AppText>
      </Pressable>
    </View>
  );
}
