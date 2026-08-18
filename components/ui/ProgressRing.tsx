import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, G } from 'react-native-svg';

import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

type ProgressRingProps = {
  progress: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  labelClassName?: string;
  caption?: string;
  color?: string;
};

export function ProgressRing({
  progress,
  size = 88,
  strokeWidth = 8,
  label,
  labelClassName,
  caption,
  color = THEME.accent,
}: ProgressRingProps) {
  const clamped = Math.max(0, Math.min(1, progress));
  const cx = size / 2;
  const cy = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const animated = useSharedValue(0);

  useEffect(() => {
    animated.value = withTiming(clamped, {
      duration: 700,
      easing: Easing.out(Easing.cubic),
    });
  }, [animated, clamped]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animated.value),
  }));

  return (
    <View className="items-center justify-center" style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <G transform={`rotate(-90 ${cx} ${cy})`}>
          <Circle
            cx={cx}
            cy={cy}
            r={radius}
            stroke={THEME.border}
            strokeWidth={strokeWidth}
            fill="none"
          />
          <AnimatedCircle
            cx={cx}
            cy={cy}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={[circumference, circumference]}
            animatedProps={animatedProps}
          />
        </G>
      </Svg>
      <View className="absolute items-center">
        {label ? (
          <AppText className={labelClassName ?? 'text-lg font-bold text-charcoal'}>{label}</AppText>
        ) : null}
        {caption ? (
          <AppText className="text-[10px] uppercase tracking-widest text-muted">
            {caption}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}
