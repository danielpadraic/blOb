import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

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

const ALL_BFP_SOURCES = [...Object.values(BOB_FRAMES), ...Object.values(BARB_FRAMES)];

const FIGURE_HEIGHT = 280;
const CROSSFADE_MS = 200;

type FrameRef = {
  gender: BodyGender;
  bucket: BodyFatBucket;
};

function frameSource(frame: FrameRef): number {
  return (frame.gender === 'female' ? BARB_FRAMES : BOB_FRAMES)[frame.bucket];
}

function sameFrame(a: FrameRef, b: FrameRef): boolean {
  return a.gender === b.gender && a.bucket === b.bucket;
}

export function preloadBodyFatFrames() {
  if (typeof Image.loadAsync === 'function') {
    void Promise.all(ALL_BFP_SOURCES.map((source) => Image.loadAsync(source).catch(() => undefined)));
  }
}

export function BodyFatFramePreload() {
  useEffect(() => {
    preloadBodyFatFrames();
  }, []);

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.preload}>
      {ALL_BFP_SOURCES.map((source) => (
        <Image key={String(source)} source={source} style={styles.preloadImage} cachePolicy="memory-disk" />
      ))}
    </View>
  );
}

type MorphingBlobProps = {
  gender: BodyGender;
  bodyFatPct: number;
  size?: number;
};

export function MorphingBlob({ gender, bodyFatPct, size = FIGURE_HEIGHT }: MorphingBlobProps) {
  const bucket = bodyFatBucket(bodyFatPct);
  const [shown, setShown] = useState<FrameRef>({ gender, bucket });
  const [incoming, setIncoming] = useState<FrameRef | null>(null);
  const incomingOpacity = useSharedValue(0);
  const incomingRef = useRef(incoming);
  const targetRef = useRef<FrameRef>({ gender, bucket });
  incomingRef.current = incoming;
  targetRef.current = { gender, bucket };
  const height = Math.round(size);

  useEffect(() => {
    preloadBodyFatFrames();
  }, []);

  useEffect(() => {
    const next: FrameRef = { gender, bucket };
    if (next.gender === shown.gender && next.bucket === shown.bucket) {
      setIncoming(null);
      return;
    }
    setIncoming((current) => {
      if (current && sameFrame(current, next)) {
        return current;
      }
      incomingOpacity.value = 0;
      return next;
    });
  }, [bucket, gender, incomingOpacity, shown.bucket, shown.gender]);

  const overlayStyle = useAnimatedStyle(() => ({
    opacity: incomingOpacity.value,
  }));

  function promoteIncoming() {
    const next = incomingRef.current;
    const want = targetRef.current;
    if (!next || !sameFrame(next, want)) {
      return;
    }
    setShown(next);
  }

  function onIncomingLoad() {
    const next = incomingRef.current;
    const want = targetRef.current;
    if (!next || !sameFrame(next, want)) {
      return;
    }
    incomingOpacity.value = withTiming(1, { duration: CROSSFADE_MS }, (finished) => {
      if (finished) {
        runOnJS(promoteIncoming)();
      }
    });
  }

  return (
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
        source={frameSource(shown)}
        style={{ width: '100%', height }}
        contentFit="contain"
        cachePolicy="memory-disk"
        transition={{ duration: 0, effect: null }}
        priority="high"
      />
      {incoming ? (
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, overlayStyle]}>
          <Image
            key={`${incoming.gender}-${incoming.bucket}`}
            source={frameSource(incoming)}
            style={{ width: '100%', height }}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={{ duration: 0, effect: null }}
            priority="high"
            onLoad={onIncomingLoad}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  preload: {
    position: 'absolute',
    left: -4000,
    top: 0,
  },
  preloadImage: {
    width: FIGURE_HEIGHT,
    height: FIGURE_HEIGHT,
  },
});
