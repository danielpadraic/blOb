import { useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';
import type Svg from 'react-native-svg';

import { CounterCardSvg } from '@/components/counter/CounterCardSvg';
import { writeCounterCardPng } from '@/lib/counter/cardFile';
import { COUNTER_CARD_HEIGHT, COUNTER_CARD_WIDTH, type CounterCardModel } from '@/lib/counter/card';

type Props = {
  request: { key: string; card: CounterCardModel } | null;
  onRendered: (key: string, fileUri: string) => void;
  onFailed: (key: string, message: string) => void;
};

export function CounterCardRaster({ request, onRendered, onFailed }: Props) {
  const svgRef = useRef<Svg | null>(null);

  useEffect(() => {
    if (!request) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      const node = svgRef.current as { toDataURL?: (cb: (value: string) => void, opts?: object) => void } | null;
      if (!node || typeof node.toDataURL !== 'function') {
        if (Platform.OS === 'web') {
          onFailed(request.key, 'web-fallback');
          return;
        }
        onFailed(request.key, 'Could not build that card.');
        return;
      }
      try {
        node.toDataURL(
          (base64) => {
            if (cancelled) {
              return;
            }
            void writeCounterCardPng(base64, request.key)
              .then((uri) => {
                if (!cancelled) {
                  onRendered(request.key, uri);
                }
              })
              .catch((caught) => {
                if (!cancelled) {
                  onFailed(request.key, caught instanceof Error ? caught.message : 'Could not build that card.');
                }
              });
          },
          { width: COUNTER_CARD_WIDTH, height: COUNTER_CARD_HEIGHT },
        );
      } catch {
        onFailed(request.key, 'Could not build that card.');
      }
    }, 220);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [onFailed, onRendered, request]);

  if (!request) {
    return null;
  }
  return (
    <View
      pointerEvents="none"
      style={{ position: 'absolute', left: -4000, top: 0, width: COUNTER_CARD_WIDTH, height: COUNTER_CARD_HEIGHT }}>
      <CounterCardSvg ref={svgRef} card={request.card} />
    </View>
  );
}
