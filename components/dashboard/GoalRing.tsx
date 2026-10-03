import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedProps, useSharedValue, withTiming } from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type GoalRingProps = {
  progress: number;
  valueText: string;
  name: string;
  compare: string;
  color: string;
};

export function GoalRing({ progress, valueText, name, compare, color }: GoalRingProps) {
  const size = 104;
  const stroke = 8;
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const animated = useSharedValue(0);
  const inner = size - stroke * 2 - 10;
  const fontSize = valueText.length > 6 ? 12 : valueText.length > 4 ? 16 : 22;

  useEffect(() => {
    animated.value = withTiming(clamped, { duration: 500, easing: Easing.out(Easing.cubic) });
  }, [animated, clamped]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animated.value),
  }));

  return (
    <View style={{ width: size, alignItems: 'center' }}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <Svg width={size} height={size}>
          <G transform={`rotate(-90 ${cx} ${cy})`}>
            <Circle cx={cx} cy={cy} r={radius} stroke={THEME.border} strokeWidth={stroke} fill="none" />
            <AnimatedCircle
              cx={cx}
              cy={cy}
              r={radius}
              stroke={color}
              strokeWidth={stroke}
              fill="none"
              strokeLinecap="butt"
              strokeDasharray={[circumference, circumference]}
              animatedProps={animatedProps}
            />
          </G>
        </Svg>
        <View style={{ position: 'absolute', width: inner, alignItems: 'center' }}>
          <AppText
            style={{ fontSize, fontWeight: '800', color: THEME.textPrimary, textAlign: 'center' }}
            numberOfLines={1}>
            {valueText}
          </AppText>
        </View>
      </View>
      <AppText style={{ marginTop: 6, fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: THEME.textMuted }}>
        {name}
      </AppText>
      <AppText style={{ marginTop: 2, fontSize: 12, fontWeight: '700', color: THEME.textPrimary, textAlign: 'center' }}>
        {compare}
      </AppText>
    </View>
  );
}
