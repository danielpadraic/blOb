import { useMemo, useRef } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { clampStanceScore, stanceFromTrackTop } from '@/lib/interests';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';

const TRACK_H = 140;
const THUMB = 28;
const TRACK_W = 8;

type StanceSliderProps = {
  value: number;
  onChange: (next: number) => void;
};

export function StanceSlider({ value, onChange }: StanceSliderProps) {
  const height = useSharedValue(TRACK_H);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const score = clampStanceScore(value);
  // stance_score 1 = top (Excel), 5 = bottom (Leveling up).
  const ratio = (score - 1) / 4;
  const thumbTop = ratio * (TRACK_H - THUMB);
  const fillH = thumbTop + THUMB / 2;

  function applyY(y: number) {
    const track = height.value || TRACK_H;
    const t = Math.min(Math.max(y / track, 0), 1);
    onChangeRef.current(stanceFromTrackTop(t));
  }

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .onBegin((event) => {
          runOnJS(applyY)(event.y);
        })
        .onUpdate((event) => {
          runOnJS(applyY)(event.y);
        }),
    [],
  );

  return (
    <View className="items-center" style={{ gap: THEME.space[8] }}>
      <AppText className="text-[13px] font-bold" style={{ color: THEME.textPrimary }}>
        {copy('interests.excel')}
      </AppText>
      <GestureDetector gesture={gesture}>
        <View
          style={{
            height: TRACK_H,
            width: 44,
            alignItems: 'center',
            justifyContent: 'flex-start',
          }}
          onLayout={(event) => {
            height.value = Math.max(event.nativeEvent.layout.height, 1);
          }}
          accessibilityRole="adjustable"
          accessibilityLabel="Excel to leveling up"
          accessibilityValue={{ min: 1, max: 5, now: score }}>
          <View
            style={{
              width: TRACK_W,
              height: TRACK_H,
              borderRadius: 999,
              backgroundColor: THEME.border,
              overflow: 'hidden',
            }}>
            <View
              style={{
                width: TRACK_W,
                height: Math.min(Math.max(fillH, 0), TRACK_H),
                backgroundColor: THEME.accent,
                borderRadius: 999,
              }}
            />
          </View>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: thumbTop,
              width: THUMB,
              height: THUMB,
              borderRadius: 999,
              backgroundColor: THEME.surface,
              borderWidth: 2,
              borderColor: THEME.accent,
            }}
          />
        </View>
      </GestureDetector>
      <AppText className="text-[13px] font-bold" style={{ color: THEME.textPrimary }}>
        {copy('interests.levelingUp')}
      </AppText>
    </View>
  );
}
