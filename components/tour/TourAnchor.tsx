import { useCallback, type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';

import { useTourOptional } from '@/components/tour/TourContext';

type TourAnchorProps = {
  id: string;
  children: ReactNode;
};

export function TourAnchor({ id, children }: TourAnchorProps) {
  const tour = useTourOptional();

  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (!tour) {
        return;
      }
      const node = event.target as unknown as {
        measureInWindow?: (cb: (x: number, y: number, width: number, height: number) => void) => void;
      };
      if (typeof node.measureInWindow === 'function') {
        node.measureInWindow((x, y, width, height) => {
          tour.register(id, { x, y, width, height });
        });
        return;
      }
      tour.register(id, event.nativeEvent.layout);
    },
    [id, tour],
  );

  return (
    <View collapsable={false} onLayout={onLayout}>
      {children}
    </View>
  );
}
