import { useEffect, useState } from 'react';
import { Pressable, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';
import { dismissKeyboard } from '@/utils/keyboard';

type StepperProps = {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  accessibilityLabel?: string;
  formatValue?: (value: number) => string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeDraft(raw: string, allowDecimal: boolean): string {
  const next = raw.replace(allowDecimal ? /[^0-9.]/g : /[^0-9]/g, '');
  if (!allowDecimal) {
    return next;
  }
  const dot = next.indexOf('.');
  if (dot === -1) {
    return next;
  }
  return `${next.slice(0, dot + 1)}${next.slice(dot + 1).replace(/\./g, '')}`;
}

function parseDraft(raw: string, allowDecimal: boolean): number | null {
  const cleaned = sanitizeDraft(raw, allowDecimal);
  if (!cleaned || cleaned === '.') {
    return null;
  }
  const parsed = allowDecimal ? Number(cleaned) : Number.parseInt(cleaned, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

export function StepperField({
  label,
  hint,
  ...stepper
}: StepperProps & { label: string; hint?: string }) {
  return (
    <View className="w-full gap-1.5">
      <View className="flex-row items-center gap-3">
        <View style={{ flexGrow: 1, flexShrink: 1, minWidth: 120 }}>
          <AppText className="text-sm font-semibold text-charcoal">{label}</AppText>
        </View>
        <View style={{ flexShrink: 0 }}>
          <Stepper {...stepper} accessibilityLabel={stepper.accessibilityLabel ?? label} />
        </View>
      </View>
      {hint ? <AppText className="text-[13px] leading-5 text-muted">{hint}</AppText> : null}
    </View>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 10_000,
  step = 1,
  accessibilityLabel,
  formatValue,
}: StepperProps) {
  const allowDecimal = Boolean(formatValue);
  const safe = clamp(Number.isFinite(value) ? value : min, min, max);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(String(safe));

  useEffect(() => {
    if (!focused) {
      setDraft(String(safe));
    }
  }, [focused, safe]);

  function bump(delta: number) {
    dismissKeyboard();
    onChange(clamp(safe + delta, min, max));
  }

  function commit() {
    const parsed = parseDraft(draft, allowDecimal);
    if (parsed == null) {
      setDraft(String(safe));
      return;
    }
    onChange(clamp(parsed, min, max));
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
      <TextInput
        accessibilityLabel={accessibilityLabel}
        value={focused ? draft : formatValue ? formatValue(safe) : String(safe)}
        onChangeText={(text) => setDraft(sanitizeDraft(text, allowDecimal))}
        onFocus={() => {
          setFocused(true);
          setDraft(String(safe));
        }}
        onBlur={() => {
          commit();
          setFocused(false);
        }}
        onSubmitEditing={commit}
        keyboardType={allowDecimal ? 'decimal-pad' : 'number-pad'}
        inputMode={allowDecimal ? 'decimal' : 'numeric'}
        selectTextOnFocus
        textAlign="center"
        style={{
          minWidth: 72,
          minHeight: 40,
          paddingHorizontal: 4,
          fontSize: 16,
          fontWeight: '800',
          color: THEME.textPrimary,
        }}
      />
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
