import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Platform, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';

import { useTourOptional } from '@/components/tour/TourContext';

type TourAnchorProps = {
  id: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function TourAnchor({ id, children, style }: TourAnchorProps) {
  const tour = useTourOptional();
  const viewRef = useRef<View>(null);

  const report = useCallback(() => {
    if (!tour) {
      return;
    }
    viewRef.current?.measureInWindow((x, y, width, height) => {
      tour.register(id, { x, y, width, height });
    });
  }, [id, tour]);

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
      report();
    },
    [id, report, tour],
  );

  useEffect(() => {
    if (!tour?.active && !tour?.createActive) {
      return;
    }
    const frame = requestAnimationFrame(report);
    return () => cancelAnimationFrame(frame);
  }, [report, tour?.active, tour?.createActive, tour?.epoch]);

  useEffect(() => {
    if ((!tour?.active && !tour?.createActive) || tour.targetId !== id) {
      return;
    }
    if (Platform.OS === 'web' && !tour.createActive) {
      const node = viewRef.current as unknown as { scrollIntoView?: (opts: ScrollIntoViewOptions) => void };
      node?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
    const handle = setTimeout(report, 360);
    return () => clearTimeout(handle);
  }, [id, report, tour?.active, tour?.createActive, tour?.targetId]);

  return (
    <View ref={viewRef} collapsable={false} onLayout={onLayout} style={style}>
      {children}
    </View>
  );
}
