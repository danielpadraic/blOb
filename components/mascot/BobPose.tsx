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

const WAVE = require('@/assets/login/blob-login.png');

const SOURCES: Record<BobPoseName, number> = {
  wave: WAVE,
  point: WAVE,
  clap: WAVE,
  celebrate: WAVE,
  trophy: WAVE,
  heart: WAVE,
  thumbsUp: WAVE,
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
        recyclingKey="bob-3d-wave"
        transition={0}
      />
    </View>
  );
}
