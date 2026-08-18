import { Image } from 'expo-image';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { bodyFatBucket, type BodyFatBucket, type BodyGender } from '@/lib/bodyMetrics';

const BOB_FRAMES: Record<BodyFatBucket, number> = {
  lt5: require('@/assets/body-metrics/bob/bob_leblob_bfp_lt5.png'),
  '5-10': require('@/assets/body-metrics/bob/bob_leblob_bfp_5-10.png'),
  '11-15': require('@/assets/body-metrics/bob/bob_leblob_bfp_11-15.png'),
  '16-20': require('@/assets/body-metrics/bob/bob_leblob_bfp_16-20.png'),
  '21-25': require('@/assets/body-metrics/bob/bob_leblob_bfp_21-25.png'),
  '26-30': require('@/assets/body-metrics/bob/bob_leblob_bfp_26-30.png'),
  '31-35': require('@/assets/body-metrics/bob/bob_leblob_bfp_31-35.png'),
  '36-40': require('@/assets/body-metrics/bob/bob_leblob_bfp_36-40.png'),
  '41plus': require('@/assets/body-metrics/bob/bob_leblob_bfp_41plus.png'),
};

const BARB_FRAMES: Record<BodyFatBucket, number> = {
  lt5: require('@/assets/body-metrics/barb/barb_leblob_bfp_lt5.png'),
  '5-10': require('@/assets/body-metrics/barb/barb_leblob_bfp_5-10.png'),
  '11-15': require('@/assets/body-metrics/barb/barb_leblob_bfp_11-15.png'),
  '16-20': require('@/assets/body-metrics/barb/barb_leblob_bfp_16-20.png'),
  '21-25': require('@/assets/body-metrics/barb/barb_leblob_bfp_21-25.png'),
  '26-30': require('@/assets/body-metrics/barb/barb_leblob_bfp_26-30.png'),
  '31-35': require('@/assets/body-metrics/barb/barb_leblob_bfp_31-35.png'),
  '36-40': require('@/assets/body-metrics/barb/barb_leblob_bfp_36-40.png'),
  '41plus': require('@/assets/body-metrics/barb/barb_leblob_bfp_41plus.png'),
};

const FIGURE_HEIGHT = 320;

type MorphingBlobProps = {
  gender: BodyGender;
  bodyFatPct: number;
  size?: number;
};

export function MorphingBlob({ gender, bodyFatPct, size = FIGURE_HEIGHT }: MorphingBlobProps) {
  const bucket = bodyFatBucket(bodyFatPct);
  const source = (gender === 'female' ? BARB_FRAMES : BOB_FRAMES)[bucket];
  const height = Math.round(size);

  return (
    <View className="items-center" style={{ backgroundColor: 'transparent' }}>
      <View
        accessibilityRole="image"
        accessibilityLabel={`${gender === 'female' ? 'Barb' : 'Bob'} at about ${Math.round(bodyFatPct)} percent body fat`}
        className="items-center justify-center"
        style={{
          width: '100%',
          height,
          overflow: 'visible',
          backgroundColor: 'transparent',
        }}>
        <Image
          source={source}
          recyclingKey={`${gender}-${bucket}`}
          style={{ width: '100%', height }}
          contentFit="contain"
          transition={80}
        />
      </View>
      <AppText className="mt-1 text-center text-[12px] text-muted">Just a shape. Not a score.</AppText>
    </View>
  );
}
