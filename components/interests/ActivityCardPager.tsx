import { Children, forwardRef, useEffect, useImperativeHandle, useRef, useState, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { CARD_SLIDE_MS } from '@/lib/interests';

const EASE = Easing.out(Easing.cubic);

export type ActivityCardPagerHandle = {
  /** Slide the current card off, then resolve. Used for Done → next room and Back → picker. */
  exit: (direction: 'left' | 'right') => Promise<void>;
};

type ActivityCardPagerProps = {
  index: number;
  reduceMotion: boolean;
  children: ReactNode;
};

export const ActivityCardPager = forwardRef<ActivityCardPagerHandle, ActivityCardPagerProps>(
  function ActivityCardPager({ index, reduceMotion, children }, ref) {
    const pages = Children.toArray(children);
    const [boxW, setBoxW] = useState(0);
    const x = useSharedValue(0);
    const indexRef = useRef(index);
    const widthRef = useRef(0);
    const reduceRef = useRef(reduceMotion);
    const exitingRef = useRef(false);
    indexRef.current = index;
    reduceRef.current = reduceMotion;

    useEffect(() => {
      if (boxW < 1 || exitingRef.current) {
        return;
      }
      widthRef.current = boxW;
      x.value = withTiming(-index * boxW, {
        duration: reduceMotion ? 0 : CARD_SLIDE_MS,
        easing: EASE,
      });
    }, [boxW, index, reduceMotion, x]);

    useImperativeHandle(ref, () => ({
      exit(direction) {
        const w = widthRef.current || boxW;
        const fromIndex = indexRef.current;
        const target = direction === 'left' ? -(fromIndex + 1) * w : -(fromIndex - 1) * w;
        exitingRef.current = true;
        if (reduceRef.current || w < 1) {
          x.value = target;
          return Promise.resolve();
        }
        return new Promise((resolve) => {
          const done = () => resolve();
          x.value = withTiming(target, { duration: CARD_SLIDE_MS, easing: EASE }, () => {
            runOnJS(done)();
          });
        });
      },
    }));

    const style = useAnimatedStyle(() => ({
      transform: [{ translateX: x.value }],
    }));

    const pageW = boxW > 0 ? boxW : 1;

    return (
      <View
        style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
        onLayout={(event) => {
          const next = Math.max(Math.round(event.nativeEvent.layout.width), 1);
          if (next === widthRef.current) {
            return;
          }
          widthRef.current = next;
          setBoxW(next);
          if (!exitingRef.current) {
            x.value = -indexRef.current * next;
          }
        }}>
        <Animated.View style={[{ flexDirection: 'row', height: '100%', width: pageW * Math.max(pages.length, 1) }, style]}>
          {pages.map((child, page) => (
            <View
              key={page}
              style={{
                width: pageW,
                flexGrow: 0,
                flexShrink: 0,
                height: '100%',
              }}>
              {child}
            </View>
          ))}
        </Animated.View>
      </View>
    );
  },
);
