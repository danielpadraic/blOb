import { useEffect, useState, type ReactNode } from 'react';
import { Dimensions, Platform, View, type ViewStyle } from 'react-native';

import type { VisualViewportBox } from '@/lib/clipWatch';
import { FEED_COLUMN_MAX } from '@/lib/theme';
import { subscribeVisualViewportBox, visualViewportBox, watchSurfaceBox } from '@/lib/visualViewport';

export function useWatchSurface(): { style: ViewStyle; height: number } {
  const [box, setBox] = useState<VisualViewportBox>(() =>
    Platform.OS === 'web'
      ? watchSurfaceBox(visualViewportBox(), FEED_COLUMN_MAX)
      : { top: 0, left: 0, width: 0, height: 0 },
  );

  useEffect(() => {
    if (Platform.OS !== 'web') {
      return undefined;
    }
    return subscribeVisualViewportBox((next) => setBox(watchSurfaceBox(next, FEED_COLUMN_MAX)));
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return undefined;
    }
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  if (Platform.OS !== 'web') {
    return {
      style: { flex: 1, backgroundColor: '#101312' },
      height: Dimensions.get('window').height,
    };
  }

  return {
    height: box.height,
    style: {
      position: 'fixed',
      top: box.top,
      left: box.left,
      width: box.width || '100%',
      height: box.height || '100%',
      backgroundColor: '#101312',
      zIndex: 5000,
      overflow: 'hidden',
    },
  };
}

export function WatchSurface({ children }: { children: ReactNode }) {
  const { style } = useWatchSurface();
  return <View style={style}>{children}</View>;
}
