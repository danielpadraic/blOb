import { useEffect, useState } from 'react';

import { firstRouteParam } from '@/lib/challengeLoad';

/** Wait one frame when Expo Router hands an empty `[id]` on first paint. Never throw. */
export function useStableChallengeRouteId(routeParam: unknown): { id: string; waiting: boolean } {
  const fromRoute = firstRouteParam(routeParam);
  const [held, setHeld] = useState(fromRoute);
  const [waiting, setWaiting] = useState(!fromRoute);

  useEffect(() => {
    if (fromRoute) {
      setHeld(fromRoute);
      setWaiting(false);
      return;
    }
    let cancelled = false;
    const frame = requestAnimationFrame(() => {
      if (!cancelled) {
        setWaiting(false);
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [fromRoute]);

  return {
    id: fromRoute || held,
    waiting: Boolean(waiting && !fromRoute && !held),
  };
}

export function scrollNodeTo(
  node: unknown,
  options: { x?: number; y?: number; animated?: boolean },
): boolean {
  if (node == null) {
    return false;
  }
  const scrollTo = (node as { scrollTo?: unknown }).scrollTo;
  if (typeof scrollTo !== 'function') {
    return false;
  }
  try {
    (scrollTo as (opts: { x?: number; y?: number; animated?: boolean }) => void).call(node, options);
    return true;
  } catch {
    return false;
  }
}
