import { Image } from 'expo-image';
import { View } from 'react-native';

export type BobPoseName =
  | 'wave'
  | 'point'
  | 'clap'
  | 'celebrate'
  | 'trophy'
  | 'heart'
  | 'thumbsUp';

const SOURCES: Record<BobPoseName, number> = {
  wave: require('@/assets/mascot/bob-wave.png'),
  point: require('@/assets/mascot/bob-point.png'),
  clap: require('@/assets/mascot/bob-clap.png'),
  celebrate: require('@/assets/mascot/bob-celebrate.png'),
  trophy: require('@/assets/mascot/bob-trophy.png'),
  heart: require('@/assets/mascot/bob-heart.png'),
  thumbsUp: require('@/assets/mascot/bob-thumbs-up.png'),
};

const LABELS: Record<BobPoseName, string> = {
  wave: 'Bob waving',
  point: 'Bob pointing',
  clap: 'Bob clapping',
  celebrate: 'Bob celebrating',
  trophy: 'Bob with a trophy',
  heart: 'Bob hugging a heart',
  thumbsUp: 'Bob giving a thumbs up',
};

type BobPoseProps = {
  pose: BobPoseName;
  size?: number;
};

export function BobPose({ pose, size = 72 }: BobPoseProps) {
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={LABELS[pose]}
      collapsable={false}
      style={{ width: size, height: size, backgroundColor: 'transparent', overflow: 'visible' }}>
      <Image
        source={SOURCES[pose]}
        style={{ width: size, height: size, backgroundColor: 'transparent' }}
        contentFit="contain"
        contentPosition="center"
        cachePolicy="memory-disk"
        recyclingKey={`bob-${pose}-alpha`}
        transition={0}
      />
    </View>
  );
}
