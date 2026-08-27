import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import { Platform, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTourOptional } from '@/components/tour/TourContext';
import { measureInWindowSafe } from '@/lib/measureWindow';

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
    const node = viewRef.current;
    if (node == null) {
      return;
    }
    if (typeof node.measureInWindow !== 'function') {
      return;
    }
    measureInWindowSafe(node, (rect) => {
      tour.register(id, rect);
    });
  }, [id, tour]);

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
      const node = viewRef.current;
      if (node != null && typeof (node as unknown as { scrollIntoView?: unknown }).scrollIntoView === 'function') {
        (node as unknown as { scrollIntoView: (opts: ScrollIntoViewOptions) => void }).scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: 'smooth',
        });
      }
    }
    const handle = setTimeout(report, 360);
    return () => clearTimeout(handle);
  }, [id, report, tour?.active, tour?.createActive, tour?.targetId]);

  return (
    <View
      ref={viewRef}
      pointerEvents="box-none"
      collapsable={false}
      nativeID={id}
      onLayout={report}
      style={style}>
      {children}
    </View>
  );
}
