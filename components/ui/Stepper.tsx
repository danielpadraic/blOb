import { useEffect, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';

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
    <View className="w-full gap-1.5" style={{ overflow: 'visible' }}>
      <AppText className="text-sm font-semibold text-charcoal">{label}</AppText>
      <Stepper {...stepper} accessibilityLabel={stepper.accessibilityLabel ?? label} />
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
  const allowDecimal = Boolean(formatValue) || step < 1;
  const safe = clamp(Number.isFinite(value) ? value : min, min, max);
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(String(safe));
  const [note, setNote] = useState<string | null>(null);
  const atMin = safe <= min;
  const atMax = safe >= max;

  useEffect(() => {
    if (!focused) {
      setDraft(String(safe));
    }
  }, [focused, safe]);

  function bump(delta: number) {
    setNote(null);
    if (delta < 0 && atMin) {
      setNote(copy('stepper.min'));
      return;
    }
    if (delta > 0 && atMax) {
      setNote(copy('stepper.max'));
      return;
    }
    onChange(clamp(Number((safe + delta).toFixed(step < 1 ? 2 : 0)), min, max));
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
    <View style={{ width: '100%', maxWidth: 280, overflow: 'visible' }}>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={accessibilityLabel}
        accessibilityValue={{ min, max, now: safe }}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: THEME.surface,
          borderWidth: 1,
          borderColor: THEME.border,
          borderRadius: 999,
          padding: 4,
          overflow: 'visible',
        }}>
        <StepperBump
          label="Decrease"
          glyph="−"
          faded={atMin}
          onPress={() => bump(-step)}
        />
        <TextInput
          accessibilityLabel={accessibilityLabel}
          value={focused ? draft : formatValue ? formatValue(safe) : String(safe)}
          onChangeText={(text) => setDraft(sanitizeDraft(text, allowDecimal))}
          onFocus={() => {
            setFocused(true);
            setNote(null);
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
            flexGrow: 1,
            flexShrink: 1,
            minWidth: 56,
            minHeight: 44,
            paddingHorizontal: 4,
            fontSize: 16,
            fontWeight: '800',
            color: THEME.textPrimary,
          }}
        />
        <StepperBump
          label="Increase"
          glyph="+"
          faded={atMax}
          onPress={() => bump(step)}
        />
      </View>
      {note ? (
        <AppText className="mt-1 text-[12px]" style={{ color: THEME.textMuted }}>
          {note}
        </AppText>
      ) : null}
    </View>
  );
}

function StepperBump({
  label,
  glyph,
  faded,
  onPress,
}: {
  label: string;
  glyph: string;
  faded: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: faded }}
      onPress={onPress}
      hitSlop={6}
      style={{
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: THEME.background,
        opacity: faded ? 0.38 : 1,
        flexShrink: 0,
        ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : null),
      }}>
      <AppText className="text-[18px] font-bold text-charcoal">{glyph}</AppText>
    </Pressable>
  );
}
