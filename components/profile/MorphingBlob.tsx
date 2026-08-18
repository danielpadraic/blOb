import { Image } from 'expo-image';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { bodyFatFrameIndex, type BodyGender } from '@/lib/bodyMetrics';

const FEMALE_FRAMES = [
  require('@/assets/body-metrics/female/00.png'),
  require('@/assets/body-metrics/female/01.png'),
  require('@/assets/body-metrics/female/02.png'),
  require('@/assets/body-metrics/female/03.png'),
  require('@/assets/body-metrics/female/04.png'),
  require('@/assets/body-metrics/female/05.png'),
  require('@/assets/body-metrics/female/06.png'),
  require('@/assets/body-metrics/female/07.png'),
  require('@/assets/body-metrics/female/08.png'),
  require('@/assets/body-metrics/female/09.png'),
] as const;

const MALE_FRAMES = [
  require('@/assets/body-metrics/male/00.png'),
  require('@/assets/body-metrics/male/01.png'),
  require('@/assets/body-metrics/male/02.png'),
  require('@/assets/body-metrics/male/03.png'),
  require('@/assets/body-metrics/male/04.png'),
  require('@/assets/body-metrics/male/05.png'),
  require('@/assets/body-metrics/male/06.png'),
  require('@/assets/body-metrics/male/07.png'),
  require('@/assets/body-metrics/male/08.png'),
  require('@/assets/body-metrics/male/09.png'),
] as const;

type MorphingBlobProps = {
  gender: BodyGender;
  bodyFatPct: number;
  size?: number;
};

export function MorphingBlob({ gender, bodyFatPct, size = 280 }: MorphingBlobProps) {
  const frames = gender === 'female' ? FEMALE_FRAMES : MALE_FRAMES;
  const frame = bodyFatFrameIndex(bodyFatPct);
  const source = frames[frame] ?? frames[0];
  const scale = 0.84 + (frame / Math.max(frames.length - 1, 1)) * 0.22;
  const stage = Math.round(size);
  const hint =
    frame <= 2 ? 'Lean and compact. Just a shape.' : frame >= 7 ? 'Softer and broader. Just a shape.' : 'A friendly blob, not a score.';

  return (
    <View className="items-center" style={{ backgroundColor: 'transparent' }}>
      <View
        accessibilityRole="image"
        accessibilityLabel={`${gender} blOb at about ${Math.round(bodyFatPct)} percent body fat`}
        className="items-center justify-center"
        style={{
          width: stage,
          height: Math.round(stage * 1.15),
          overflow: 'visible',
          backgroundColor: 'transparent',
        }}>
        <Image
          source={source}
          style={{
            width: stage,
            height: Math.round(stage * 1.15),
            transform: [{ scale }],
          }}
          contentFit="contain"
          transition={80}
        />
      </View>
      <AppText className="mt-1 text-center text-[12px] text-muted">{hint}</AppText>
    </View>
  );
}
