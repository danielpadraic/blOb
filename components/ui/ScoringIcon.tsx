import { Image } from 'expo-image';
import { View } from 'react-native';

import {
  resolveScoringIconKey,
  scoringIconLabel,
  type ScoringIconKey,
} from '@/lib/scoringIcons';

const SOURCES: Record<ScoringIconKey, number> = {
  calls: require('@/assets/scoring/calls.png'),
  presentation: require('@/assets/scoring/presentation.png'),
  money: require('@/assets/scoring/money.png'),
  star: require('@/assets/scoring/star.png'),
  checklist: require('@/assets/scoring/checklist.png'),
  calendar: require('@/assets/scoring/calendar.png'),
  camera: require('@/assets/scoring/camera.png'),
  timer: require('@/assets/scoring/timer.png'),
  steps: require('@/assets/scoring/steps.png'),
  route: require('@/assets/scoring/route.png'),
  strength: require('@/assets/scoring/strength.png'),
  heart: require('@/assets/scoring/heart.png'),
  fire: require('@/assets/scoring/fire.png'),
  hydration: require('@/assets/scoring/hydration.png'),
  reading: require('@/assets/scoring/reading.png'),
  writing: require('@/assets/scoring/writing.png'),
  learning: require('@/assets/scoring/learning.png'),
  trophy: require('@/assets/scoring/trophy.png'),
  generic: require('@/assets/scoring/star.png'),
};

export function ScoringIcon({
  iconKey,
  size = 24,
  label,
}: {
  iconKey?: string | null;
  size?: number;
  label?: string;
}) {
  const key = resolveScoringIconKey({ icon_key: iconKey });
  const source = SOURCES[key] ?? SOURCES.generic;
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label?.trim() || scoringIconLabel(key)}
      style={{ width: size, height: size, backgroundColor: 'transparent' }}>
      <Image
        source={source}
        style={{ width: size, height: size, backgroundColor: 'transparent' }}
        contentFit="contain"
        accessibilityElementsHidden
      />
    </View>
  );
}
