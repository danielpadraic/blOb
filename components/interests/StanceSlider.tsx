import { useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS, useSharedValue } from 'react-native-reanimated';

import { AppText } from '@/components/ui/AppText';
import { clampStanceScore, STANCE_MAX, STANCE_MIN, stanceFromTrack } from '@/lib/interests';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';

const TRACK_H = 8;
const THUMB = 28;
const HIT_H = 36;

type StanceSliderProps = {
  value: number;
  onChange: (next: number) => void;
};

export function StanceSlider({ value, onChange }: StanceSliderProps) {
  const width = useSharedValue(1);
  const [trackW, setTrackW] = useState(1);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const score = clampStanceScore(value);
  // 1 = full left (Level Up), 50 = full right (Excel). Free slide, no snap.
  const ratio = Math.min(Math.max((score - STANCE_MIN) / (STANCE_MAX - STANCE_MIN), 0), 1);
  const pad = THUMB / 2;
  const travel = Math.max(trackW - THUMB, 0);

  function applyX(x: number) {
    const track = width.value || 1;
    const inner = Math.max(track - THUMB, 1);
    const t = Math.min(Math.max((x - pad) / inner, 0), 1);
    onChangeRef.current(stanceFromTrack(t));
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
    <View style={{ width: '100%' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <AppText
          className="text-[12px] font-bold"
          numberOfLines={1}
          style={{ color: THEME.textPrimary, flexShrink: 0 }}>
          {copy('interests.levelingUp')}
        </AppText>
        <GestureDetector gesture={gesture}>
          <View
            style={{
              flex: 1,
              minWidth: 0,
              height: HIT_H,
              justifyContent: 'center',
            }}
            onLayout={(event) => {
              const next = Math.max(event.nativeEvent.layout.width, 1);
              width.value = next;
              setTrackW(next);
            }}
            accessibilityRole="adjustable"
            accessibilityLabel="Level Up to Excel">
            <View
              style={{
                height: TRACK_H,
                borderRadius: 999,
                backgroundColor: THEME.border,
                overflow: 'hidden',
              }}>
              <View
                style={{
                  height: TRACK_H,
                  width: `${ratio * 100}%`,
                  borderRadius: 999,
                  backgroundColor: THEME.accent,
                }}
              />
            </View>
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: (HIT_H - THUMB) / 2,
                left: ratio * travel,
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
        <AppText
          className="text-[12px] font-bold"
          numberOfLines={1}
          style={{ color: THEME.textPrimary, flexShrink: 0 }}>
          {copy('interests.excel')}
        </AppText>
      </View>
    </View>
  );
}
