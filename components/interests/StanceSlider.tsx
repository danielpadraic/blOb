import { useMemo, useRef } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { clampStanceScore } from '@/lib/interests';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';

type StanceSliderProps = {
  value: number;
  onChange: (next: number) => void;
};

export function StanceSlider({ value, onChange }: StanceSliderProps) {
  const width = useSharedValue(1);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const score = clampStanceScore(value);
  const ratio = (score - 1) / 4;

  function applyX(x: number) {
    const track = width.value || 1;
    const t = Math.min(Math.max(x / track, 0), 1);
    onChangeRef.current(clampStanceScore(t * 4 + 1));
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
    <View className="gap-1">
      <GestureDetector gesture={gesture}>
        <View
          className="h-11 justify-center"
          onLayout={(event) => {
            width.value = Math.max(event.nativeEvent.layout.width, 1);
          }}
          accessibilityRole="adjustable"
          accessibilityLabel="Excel to leveling up"
          accessibilityValue={{ min: 1, max: 5, now: score }}>
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
                style={{ color: ratio > 0.12 ? THEME.primaryForeground : THEME.textPrimary }}>
                {copy('interests.excel')}
              </AppText>
              <AppText
                className="text-[11px] font-bold"
                numberOfLines={1}
                style={{ color: ratio > 0.78 ? THEME.primaryForeground : THEME.textPrimary }}>
                {copy('interests.levelingUp')}
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
      <AppText className="text-center text-[13px] font-extrabold text-charcoal">{score}</AppText>
    </View>
  );
}
