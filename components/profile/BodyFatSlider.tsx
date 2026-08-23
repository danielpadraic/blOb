import { useMemo, useRef } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { BODY_FAT_MAX, BODY_FAT_MIN, clampBodyFat } from '@/lib/bodyMetrics';
import { THEME } from '@/lib/theme';

type BodyFatSliderProps = {
  value: number;
  onChange: (value: number) => void;
};

export function BodyFatSlider({ value, onChange }: BodyFatSliderProps) {
  const width = useSharedValue(1);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const pct = clampBodyFat(value);
  const ratio = (pct - BODY_FAT_MIN) / (BODY_FAT_MAX - BODY_FAT_MIN);
  const leftOnFill = ratio > 0.1;
  const rightOnFill = ratio > 0.9;

  function applyX(x: number) {
    const track = width.value || 1;
    const next =
      BODY_FAT_MIN + (Math.min(Math.max(x, 0), track) / track) * (BODY_FAT_MAX - BODY_FAT_MIN);
    onChangeRef.current(Math.round(clampBodyFat(next)));
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

  return (
    <View className="gap-1.5">
      <GestureDetector gesture={gesture}>
        <View
          className="h-11 justify-center"
          onLayout={(event) => {
            width.value = Math.max(event.nativeEvent.layout.width, 1);
          }}
          accessibilityRole="adjustable"
          accessibilityLabel="Current body fat percentage"
          accessibilityValue={{ min: BODY_FAT_MIN, max: BODY_FAT_MAX, now: Math.round(pct) }}>
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
                {BODY_FAT_MIN}%
              </AppText>
              <AppText
                className="text-[11px] font-bold"
                style={{ color: rightOnFill ? THEME.primaryForeground : THEME.textPrimary }}>
                {BODY_FAT_MAX}%
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
      <View className="flex-row items-end justify-between">
        <AppText className="text-[13px] text-muted">Current body fat</AppText>
        <AppText className="text-[22px] font-extrabold text-charcoal">{Math.round(pct)}%</AppText>
      </View>
    </View>
  );
}
