import { useEffect, useRef } from 'react';
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

  useEffect(() => {
    if (!token) {
      return undefined;
    }
    const handle = setTimeout(() => {
      if (ref.current) {
        form?.scrollFieldIntoView(ref.current);
      }
    }, 160);
    opacity.setValue(1);
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.4, duration: 160, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      ]),
      { iterations: 3 },
    );
    anim.start();
    return () => {
      clearTimeout(handle);
      anim.stop();
      opacity.setValue(1);
    };
  }, [form, opacity, token]);

  return { ref, style: { opacity } };
}
