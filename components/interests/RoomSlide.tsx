import { useEffect, useRef, useState, type ReactNode } from 'react';
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

type RoomSlideProps = {
  roomKey: string;
  direction: 1 | -1;
  reduceMotion: boolean;
  children: ReactNode;
};

export function RoomSlide({ roomKey, direction, reduceMotion, children }: RoomSlideProps) {
  const [boxW, setBoxW] = useState(0);
  const [outgoing, setOutgoing] = useState<ReactNode>(null);
  const x = useSharedValue(0);
  const prevKey = useRef(roomKey);
  const prevKids = useRef(children);
  const dirRef = useRef(direction);
  dirRef.current = direction;

  if (prevKey.current !== roomKey) {
    if (!reduceMotion) {
      setOutgoing(prevKids.current);
    }
    prevKey.current = roomKey;
  }
  prevKids.current = children;

  useEffect(() => {
    if (!outgoing) {
      x.value = 0;
      return;
    }
    if (boxW < 1) {
      return;
    }
    const width = boxW;
    const dir = dirRef.current;
    x.value = dir === 1 ? 0 : -width;
    const target = dir === 1 ? -width : 0;
    const clear = () => {
      setOutgoing(null);
      x.value = 0;
    };
    x.value = withTiming(target, { duration: CARD_SLIDE_MS, easing: EASE }, (finished) => {
      if (finished) {
        runOnJS(clear)();
      }
    });
  }, [outgoing, boxW, x]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }],
  }));

  const pageW = boxW > 0 ? boxW : 1;
  const dir = dirRef.current;
  const first = dir === 1 ? outgoing : children;
  const second = dir === 1 ? children : outgoing;
  const pages = outgoing ? [first, second] : [children];

  return (
    <View
      style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}
      onLayout={(event) => {
        const next = Math.max(Math.round(event.nativeEvent.layout.width), 1);
        if (next !== boxW) {
          setBoxW(next);
        }
      }}>
      <Animated.View
        style={[
          {
            flexDirection: 'row',
            height: '100%',
            width: pageW * pages.length,
          },
          style,
        ]}>
        {pages.map((child, index) => (
          <View
            key={index}
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
}
