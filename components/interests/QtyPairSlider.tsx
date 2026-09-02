import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import { Chip, ChipRow } from '@/components/ui/Chip';
import { AppText } from '@/components/ui/AppText';
import {
  clampQty,
  QTY_BANDS,
  QTY_PERIODS,
  QTY_PERIOD_LABELS,
  type QtyKind,
} from '@/lib/interestsFollowup';
import type { QtyPeriod } from '@/lib/interestsCatalog';
import { THEME } from '@/lib/theme';

type QtySliderProps = {
  label: string;
  kind: QtyKind;
  value: number | null;
  onChange: (next: number) => void;
};

export function QtySlider({ label, kind, value, onChange }: QtySliderProps) {
  const band = QTY_BANDS[kind];
  const width = useSharedValue(1);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const numeric = value == null ? band.min : clampQty(kind, value);
  const ratio = band.max === band.min ? 0 : (numeric - band.min) / (band.max - band.min);
  const leftOnFill = ratio > 0.12;
  const rightOnFill = ratio > 0.88;
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(formatQty(kind, numeric));

  useEffect(() => {
    if (!focused) {
      setDraft(formatQty(kind, numeric));
    }
  }, [focused, kind, numeric]);

  function applyX(x: number) {
    const track = width.value || 1;
    const next = band.min + (Math.min(Math.max(x, 0), track) / track) * (band.max - band.min);
    onChangeRef.current(clampQty(kind, next));
  }

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin((event) => {
          runOnJS(applyX)(event.x);
        })
        .onUpdate((event) => {
          runOnJS(applyX)(event.x);
        }),
    [],
  );

  function commit() {
    const parsed = Number(draft.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(parsed)) {
      setDraft(formatQty(kind, numeric));
      return;
    }
    onChange(clampQty(kind, parsed));
  }

  return (
    <View className="gap-1">
      <AppText className="text-[13px] font-semibold text-charcoal">{label}</AppText>
      <GestureDetector gesture={gesture}>
        <View
          className="h-11 justify-center"
          onLayout={(event) => {
            width.value = Math.max(event.nativeEvent.layout.width, 1);
          }}
          accessibilityRole="adjustable"
          accessibilityLabel={label}
          accessibilityValue={{ min: band.min, max: band.max, now: numeric }}>
          <View className="h-6 justify-center overflow-hidden rounded-full" style={{ backgroundColor: THEME.border }}>
            <View
              className="h-full rounded-full"
              style={{
                width: `${Math.min(Math.max(ratio, 0), 1) * 100}%`,
                backgroundColor: THEME.accent,
              }}
            />
            <View
              pointerEvents="none"
              className="absolute inset-0 flex-row items-center justify-between px-2">
              <AppText
                className="text-[11px] font-bold"
                style={{ color: leftOnFill ? THEME.primaryForeground : THEME.textPrimary }}>
                {band.minLabel}
              </AppText>
              <AppText
                className="text-[11px] font-bold"
                style={{ color: rightOnFill ? THEME.primaryForeground : THEME.textPrimary }}>
                {band.maxLabel}
              </AppText>
            </View>
          </View>
          <View
            className="absolute h-7 w-7 rounded-full"
            style={{
              top: 8,
              left: `${Math.min(Math.max(ratio, 0), 1) * 100}%`,
              marginLeft: -14,
              backgroundColor: THEME.surface,
              borderWidth: 2,
              borderColor: THEME.accent,
            }}
          />
        </View>
      </GestureDetector>
      <TextInput
        accessibilityLabel={label}
        value={focused ? draft : formatQty(kind, numeric)}
        onChangeText={setDraft}
        onFocus={() => {
          setFocused(true);
          setDraft(formatQty(kind, numeric));
        }}
        onBlur={() => {
          commit();
          setFocused(false);
        }}
        onSubmitEditing={commit}
        keyboardType={band.step < 1 ? 'decimal-pad' : 'number-pad'}
        inputMode={band.step < 1 ? 'decimal' : 'numeric'}
        selectTextOnFocus
        textAlign="center"
        style={{
          alignSelf: 'center',
          minWidth: 72,
          minHeight: 36,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: THEME.border,
          backgroundColor: THEME.surface,
          fontSize: 16,
          fontWeight: '800',
          color: THEME.textPrimary,
          paddingHorizontal: 8,
          ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
        }}
      />
    </View>
  );
}

type QtyPairSliderProps = {
  kind: QtyKind;
  current: number | null;
  goal: number | null;
  onCurrent: (next: number) => void;
  onGoal: (next: number) => void;
  unitLabel?: string;
  period?: QtyPeriod | null;
  onPeriod?: (next: QtyPeriod) => void;
};

export function QtyPairSlider({
  kind,
  current,
  goal,
  onCurrent,
  onGoal,
  unitLabel,
  period,
  onPeriod,
}: QtyPairSliderProps) {
  const unit = unitLabel ?? QTY_BANDS[kind].unitLabel;
  return (
    <View className="gap-3">
      <QtySlider label={`Current · ${unit}`} kind={kind} value={current} onChange={onCurrent} />
      <QtySlider label={`Goal · ${unit}`} kind={kind} value={goal} onChange={onGoal} />
      {onPeriod ? (
        <View className="gap-1">
          <ChipRow>
            {QTY_PERIODS.map((value) => (
              <Chip
                key={value}
                label={QTY_PERIOD_LABELS[value]}
                selected={period === value}
                onPress={() => onPeriod(value)}
              />
            ))}
          </ChipRow>
        </View>
      ) : null}
    </View>
  );
}

function formatQty(kind: QtyKind, value: number): string {
  const band = QTY_BANDS[kind];
  if (band.step < 1) {
    return String(Number(value.toFixed(1)));
  }
  return String(Math.round(value));
}
