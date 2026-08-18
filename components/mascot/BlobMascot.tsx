import { Image } from 'expo-image';
import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { cn } from '@/utils/cn';

const wave = require('@/assets/mascot/bob-wave.png');
const logo = require('@/assets/mascot/blob-logo.png');

type MascotVariant = 'wave' | 'logo';
type Motion = 'none' | 'pulse' | 'float';

type BlobMascotProps = {
  variant?: MascotVariant;
  size?: number;
  motion?: Motion;
  className?: string;
};

export function BlobMascot({
  variant = 'wave',
  size = 180,
  motion = 'none',
  className,
}: BlobMascotProps) {
  const scale = useSharedValue(1);
  const translateY = useSharedValue(0);

  useEffect(() => {
    if (motion === 'pulse') {
      scale.value = withRepeat(
        withSequence(
          withTiming(1.04, { duration: 700, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        ),
        -1,
        false,
      );
    }
    if (motion === 'float') {
      translateY.value = withRepeat(
        withSequence(
          withTiming(-6, { duration: 900, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 900, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
      );
    }
  }, [motion, scale, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: translateY.value }],
  }));

  const height = variant === 'logo' ? size * 0.55 : size;

  return (
    <Animated.View
      style={[
        animatedStyle,
        { backgroundColor: 'transparent', overflow: 'visible' },
      ]}
      className={cn('items-center justify-center bg-transparent', className)}>
      <Image
        source={variant === 'logo' ? logo : wave}
        style={{ width: size, height, backgroundColor: 'transparent' }}
        contentFit="contain"
        contentPosition="center"
        cachePolicy="memory-disk"
        recyclingKey={variant === 'logo' ? 'blob-logo-transparent' : 'bob-wave-transparent'}
        transition={0}
      />
    </Animated.View>
  );
}
