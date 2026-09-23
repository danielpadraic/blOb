import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { KeyboardField } from '@/components/ui/KeyboardFormShell';
import { WebTapButton } from '@/components/ui/WebTapButton';
import { formatCounterNumber, parseCounterInput, stepCounterValue } from '@/lib/counter/session';
import type { CounterMetric } from '@/lib/counter/types';
import { startHoldRepeat } from '@/lib/holdRepeat';
import { THEME, themeShadow } from '@/lib/theme';

type MetricCardProps = {
  metric: CounterMetric;
  readOnly?: boolean;
  onChange: (value: number) => void;
  onRename: (name: string) => void;
  onRemove: () => void;
};

export function MetricCard({ metric, readOnly, onChange, onRename, onRemove }: MetricCardProps) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState(metric.name);
  const [text, setText] = useState(formatCounterNumber(metric.kind, metric.value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) {
      setText(formatCounterNumber(metric.kind, metric.value));
    }
  }, [metric.kind, metric.value]);

  function bump(direction: 1 | -1) {
    if (readOnly) {
      return;
    }
    if (Platform.OS !== 'web') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
    onChange(stepCounterValue(metric.kind, metric.value, direction));
  }

  return (
    <View
      style={{
        backgroundColor: THEME.surface,
        borderRadius: THEME.radius,
        borderWidth: 1,
        borderColor: THEME.border,
        padding: 14,
        gap: 10,
        ...themeShadow('card'),
      }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {editingName && !readOnly ? (
          <KeyboardField>
            <TextInput
              value={name}
              onChangeText={setName}
              onBlur={() => {
                setEditingName(false);
                onRename(name);
              }}
              autoFocus
              accessibilityLabel="Metric name"
              style={{ flex: 1, minWidth: 120, fontSize: 16, fontWeight: '800', color: THEME.textPrimary, padding: 0 }}
            />
          </KeyboardField>
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Rename ${metric.name}`}
            disabled={readOnly}
            onPress={() => {
              if (!readOnly) {
                setName(metric.name);
                setEditingName(true);
              }
            }}
            style={{ flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <AppText style={{ fontSize: 16, fontWeight: '800', color: THEME.textPrimary }}>{metric.name}</AppText>
            {readOnly ? null : <Glyph name={GLYPH.pencil} color={THEME.textMuted} size={13} />}
          </Pressable>
        )}
        {readOnly ? null : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${metric.name}`}
            onPress={onRemove}
            hitSlop={8}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Glyph name={GLYPH.more} color={THEME.textMuted} size={16} />
          </Pressable>
        )}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <HoldButton label={`Decrease ${metric.name}`} disabled={readOnly} onPress={() => bump(-1)} glyph={GLYPH.minus} />
        {readOnly ? (
          <AppText
            style={{
              flex: 1,
              fontSize: 36,
              fontWeight: '800',
              textAlign: 'center',
              color: THEME.textPrimary,
            }}>
            {formatCounterNumber(metric.kind, metric.value)}
          </AppText>
        ) : (
          <View style={{ flex: 1 }}>
          <KeyboardField>
            <TextInput
              value={text}
              onChangeText={setText}
              onFocus={() => {
                focused.current = true;
                setText(String(metric.value));
              }}
              onBlur={() => {
                focused.current = false;
                onChange(parseCounterInput(metric.kind, text));
              }}
              keyboardType={metric.kind === 'count' ? 'number-pad' : 'decimal-pad'}
              inputMode={metric.kind === 'count' ? 'numeric' : 'decimal'}
              selectTextOnFocus
              accessibilityLabel={`${metric.name} value`}
              style={{
                flex: 1,
                minWidth: 80,
                minHeight: 56,
                fontSize: 36,
                fontWeight: '800',
                textAlign: 'center',
                color: THEME.textPrimary,
                padding: 0,
              }}
            />
          </KeyboardField>
          </View>
        )}
        <HoldButton label={`Increase ${metric.name}`} disabled={readOnly} onPress={() => bump(1)} glyph={GLYPH.plus} />
      </View>
    </View>
  );
}

function HoldButton({
  label,
  disabled,
  onPress,
  glyph,
}: {
  label: string;
  disabled?: boolean;
  onPress: () => void;
  glyph: (typeof GLYPH)[keyof typeof GLYPH];
}) {
  const stopRef = useRef<(() => void) | null>(null);
  function startHold() {
    if (disabled) {
      return;
    }
    onPress();
    stopRef.current?.();
    stopRef.current = startHoldRepeat(onPress);
  }
  function stopHold() {
    stopRef.current?.();
    stopRef.current = null;
  }
  useEffect(() => () => stopHold(), []);
  return (
    <WebTapButton
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => undefined}
      onPressIn={startHold}
      onPressOut={stopHold}
      style={{
        width: 52,
        height: 52,
        borderRadius: 16,
        backgroundColor: THEME.background,
        borderWidth: 1,
        borderColor: THEME.border,
        opacity: disabled ? 0.35 : 1,
      }}>
      <Glyph name={glyph} color={THEME.textPrimary} size={18} />
    </WebTapButton>
  );
}
