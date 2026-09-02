import { useEffect, useState } from 'react';
import { InteractionManager, Platform } from 'react-native';

/** Lets Home paint Official + Waves + Composer + posts before Pulse / Rounds fetch. */
export function useAfterFirstPaint(timeoutMs = 800): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const arm = () => {
      if (!cancelled) {
        setReady(true);
      }
    };
    if (Platform.OS === 'web' && typeof requestIdleCallback === 'function') {
      const idleId = requestIdleCallback(arm, { timeout: timeoutMs });
      return () => {
        cancelled = true;
        cancelIdleCallback(idleId);
      };
    }
    const handle = InteractionManager.runAfterInteractions(arm);
    const timer = setTimeout(arm, timeoutMs);
    return () => {
      cancelled = true;
      handle.cancel();
      clearTimeout(timer);
    };
  }, [timeoutMs]);

  return ready;
}
