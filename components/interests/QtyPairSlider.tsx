import { useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { clampQty, QTY_BANDS, QTY_PERIOD_LABELS, type QtyKind } from '@/lib/interestsFollowup';
import { QTY_PERIODS, type QtyPeriod } from '@/lib/interestsCatalog';
import { THEME } from '@/lib/theme';

type QtySliderProps = {
  label: string;
  kind: QtyKind;
  value: number | null;
  onChange: (next: number) => void;
  /** When value is null, park the thumb here instead of at 0. */
  previewValue?: number | null;
  emptyOk?: boolean;
  unitLabel?: string;
};

export function QtySlider({ label, kind, value, onChange, previewValue, emptyOk, unitLabel }: QtySliderProps) {
  const band = QTY_BANDS[kind];
  const width = useSharedValue(1);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const parked = value == null ? (previewValue == null ? band.min : clampQty(kind, previewValue)) : clampQty(kind, value);
  const numeric = value == null ? parked : clampQty(kind, value);
  const ratio = band.max === band.min ? 0 : (numeric - band.min) / (band.max - band.min);
  const leftOnFill = ratio > 0.12;
  const rightOnFill = ratio > 0.88;
  const [focused, setFocused] = useState(false);
  const showEmpty = Boolean(emptyOk && value == null && !focused);
  const [draft, setDraft] = useState(showEmpty ? '' : formatQty(kind, numeric));

  useEffect(() => {
    if (!focused) {
      setDraft(value == null && emptyOk ? '' : formatQty(kind, numeric));
    }
  }, [emptyOk, focused, kind, numeric, value]);

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
    if (!draft.trim()) {
      if (emptyOk) {
        return;
      }
      setDraft(formatQty(kind, numeric));
      return;
    }
    const parsed = Number(draft.replace(/[^0-9.]/g, ''));
    if (!Number.isFinite(parsed)) {
      setDraft(value == null && emptyOk ? '' : formatQty(kind, numeric));
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
        value={focused ? draft : value == null && emptyOk ? '' : formatQty(kind, numeric)}
        onChangeText={setDraft}
        onFocus={() => {
          setFocused(true);
          setDraft(value == null && emptyOk ? '' : formatQty(kind, numeric));
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
        placeholder={emptyOk ? '' : undefined}
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
      {unitLabel ? (
        <AppText className="text-center text-[12px] text-muted">{unitLabel}</AppText>
      ) : null}
    </View>
  );
}

export function PeriodRow({
  period,
  onPeriod,
}: {
  period: QtyPeriod | null;
  onPeriod: (next: QtyPeriod) => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'nowrap',
        gap: 4,
        width: '100%',
      }}>
      {QTY_PERIODS.map((value) => {
        const on = period === value;
        return (
          <Pressable
            key={value}
            onPress={() => onPeriod(value)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={QTY_PERIOD_LABELS[value]}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 32,
              paddingHorizontal: 2,
              borderRadius: 999,
              borderWidth: 1,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: on ? THEME.accent : THEME.surface,
              borderColor: on ? THEME.accent : THEME.border,
            }}>
            <AppText
              style={{
                fontSize: 11,
                fontWeight: '700',
                lineHeight: 14,
                color: on ? THEME.accentForeground : THEME.textPrimary,
              }}>
              {QTY_PERIOD_LABELS[value]}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

type QtyBlockProps = {
  label: string;
  kind: QtyKind;
  value: number | null;
  onChange: (next: number) => void;
  period: QtyPeriod | null;
  onPeriod: (next: QtyPeriod) => void;
  previewValue?: number | null;
  emptyOk?: boolean;
  unitLabel?: string;
};

export function QtyBlock({
  label,
  kind,
  value,
  onChange,
  period,
  onPeriod,
  previewValue,
  emptyOk,
  unitLabel,
}: QtyBlockProps) {
  return (
    <View className="gap-2">
      <QtySlider
        label={label}
        kind={kind}
        value={value}
        onChange={onChange}
        previewValue={previewValue}
        emptyOk={emptyOk}
        unitLabel={unitLabel}
      />
      <PeriodRow period={period} onPeriod={onPeriod} />
    </View>
  );
}

type QtyPairSliderProps = {
  kind: QtyKind;
  current: number | null;
  goal: number | null;
  onCurrent: (next: number) => void;
  onGoal: (next: number) => void;
  currentLabel: string;
  goalLabel?: string;
  currentPeriod: QtyPeriod | null;
  goalPeriod?: QtyPeriod | null;
  onCurrentPeriod: (next: QtyPeriod) => void;
  onGoalPeriod?: (next: QtyPeriod) => void;
  hideGoal?: boolean;
  unitLabel?: string;
};

export function QtyPairSlider({
  kind,
  current,
  goal,
  onCurrent,
  onGoal,
  currentLabel,
  goalLabel,
  currentPeriod,
  goalPeriod,
  onCurrentPeriod,
  onGoalPeriod,
  hideGoal,
  unitLabel,
}: QtyPairSliderProps) {
  return (
    <View className="gap-4">
      <QtyBlock
        label={currentLabel}
        kind={kind}
        value={current}
        onChange={onCurrent}
        period={currentPeriod}
        onPeriod={onCurrentPeriod}
        unitLabel={unitLabel}
      />
      {hideGoal || !goalLabel || !onGoalPeriod ? null : (
        <QtyBlock
          label={goalLabel}
          kind={kind}
          value={goal}
          onChange={onGoal}
          period={goalPeriod ?? currentPeriod}
          onPeriod={onGoalPeriod}
          previewValue={current}
          emptyOk
          unitLabel={unitLabel}
        />
      )}
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
