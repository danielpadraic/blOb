import { useEffect, useRef, useState } from 'react';
import { Animated, View } from 'react-native';

import { useKeyboardForm } from '@/components/ui/KeyboardFormShell';

/**
 * Scrolls a leftover set into view and pulses it when Complete is tapped while blocked.
 * `token` increments on each tap so the same row can pulse again.
 */
export function useLeftoverPulse(token: number) {
  const ref = useRef<View>(null);
  const opacity = useRef(new Animated.Value(1)).current;
  const form = useKeyboardForm();
  const [hot, setHot] = useState(false);

  useEffect(() => {
    if (!token) {
      setHot(false);
      return undefined;
    }
    setHot(true);
    const handle = setTimeout(() => {
      if (ref.current) {
        form?.scrollFieldIntoView(ref.current);
      }
    }, 160);
    const clearHot = setTimeout(() => setHot(false), 1400);
    opacity.setValue(1);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.55, duration: 160, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]),
      { iterations: 3 },
    );
    anim.start();
    return () => {
      clearTimeout(handle);
      clearTimeout(clearHot);
      anim.stop();
      opacity.setValue(1);
    };
  }, [form, opacity, token]);

  return { ref, hot, style: { opacity } };
}
