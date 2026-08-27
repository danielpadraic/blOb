import { useEffect, useState } from 'react';

import { firstRouteParam } from '@/lib/challengeLoad';

/** Wait while Expo Router’s `[id]` is empty. Never reuse a previous challenge id. */
export function useStableChallengeRouteId(routeParam: unknown): { id: string; waiting: boolean } {
  const fromRoute = firstRouteParam(routeParam);
  const [waiting, setWaiting] = useState(!fromRoute);

  useEffect(() => {
    if (fromRoute) {
      setWaiting(false);
      return;
    }
    setWaiting(true);
    const frame = requestAnimationFrame(() => {
      setWaiting(true);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [fromRoute]);

  return {
    id: fromRoute,
    waiting: !fromRoute || waiting,
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
