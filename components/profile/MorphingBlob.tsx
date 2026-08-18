import { Image } from 'expo-image';
import { useMemo } from 'react';
import { useWindowDimensions, View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { bodyFatFrameBlend, type BodyGender } from '@/lib/bodyMetrics';
import { THEME } from '@/lib/theme';

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
  const { width, height } = useWindowDimensions();
  const frames = useMemo(() => {
    const raw = gender === 'female' ? FEMALE_FRAMES : MALE_FRAMES;
    return raw.filter(Boolean);
  }, [gender]);
  const blend = useMemo(() => bodyFatFrameBlend(bodyFatPct), [bodyFatPct]);
  const from = frames[blend.from] ?? frames[0];
  const to = frames[blend.to] ?? from;
  const stageHeight = Math.round(
    Math.min(size * 1.18, Math.max(210, height * 0.32), Math.max(210, width * 0.86)),
  );

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={`${gender} blOb at about ${Math.round(bodyFatPct)} percent body fat`}
      className="items-center justify-end overflow-hidden"
      style={{
        width: '100%',
        height: stageHeight,
        borderRadius: THEME.radius,
        backgroundColor: '#101312',
      }}>
      {from ? (
        <Image
          source={from}
          style={{ position: 'absolute', width: '100%', height: '100%', opacity: 1 }}
          contentFit="contain"
          transition={0}
        />
      ) : (
        <AppText className="text-[18px] font-extrabold text-white">blOb</AppText>
      )}
      {to && blend.t > 0.02 ? (
        <Image
          source={to}
          style={{ position: 'absolute', width: '100%', height: '100%', opacity: blend.t }}
          contentFit="contain"
          transition={0}
        />
      ) : null}
    </View>
  );
}
