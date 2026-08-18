import { useMemo, useRef } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import {
  LAST_DONE_LABELS,
  LAST_DONE_VALUES,
  type LastDoneBucket,
} from '@/lib/fitnessProfile';
import { THEME } from '@/lib/theme';

type LastDoneSliderProps = {
  value: LastDoneBucket;
  onChange: (value: LastDoneBucket) => void;
  accessibilityLabel?: string;
};

export function LastDoneSlider({ value, onChange, accessibilityLabel }: LastDoneSliderProps) {
  const width = useSharedValue(1);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const resolved = LAST_DONE_VALUES.includes(value) ? value : 'lt_30d';
  const index = LAST_DONE_VALUES.indexOf(resolved);
  const max = LAST_DONE_VALUES.length - 1;
  const ratio = max <= 0 ? 0 : index / max;

  function applyX(x: number) {
    const track = width.value;
    if (!Number.isFinite(track) || track < 24) {
      return;
    }
    const next = Math.round((Math.min(Math.max(x, 0), track) / track) * max);
    onChangeRef.current(LAST_DONE_VALUES[Math.min(Math.max(next, 0), max)] ?? 'lt_30d');
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
    <View style={{ minWidth: 0, flexShrink: 1 }}>
      <GestureDetector gesture={gesture}>
        <View
          className="h-11 justify-center"
          onLayout={(event) => {
            width.value = Math.max(event.nativeEvent.layout.width, 1);
          }}
          accessibilityRole="adjustable"
          accessibilityLabel={accessibilityLabel ?? 'Last done'}
          accessibilityValue={{
            min: 0,
            max,
            now: index,
            text: LAST_DONE_LABELS[resolved],
          }}>
          <View className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: THEME.border }}>
            <View
              className="h-full rounded-full"
              style={{
                width: `${Math.min(Math.max(ratio, 0), 1) * 100}%`,
                backgroundColor: THEME.accent,
              }}
            />
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
      <AppText
        className="text-[11px] text-muted"
        numberOfLines={1}
        style={{ flexShrink: 0 }}>
        {LAST_DONE_LABELS[resolved]}
      </AppText>
    </View>
  );
}
