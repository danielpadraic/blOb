import { useEffect, useState } from 'react';

import { firstRouteParam } from '@/lib/challengeLoad';
import { isChallengeRouteId } from '@/lib/challengeTimezone';

/** Wait while Expo Router’s `[id]` is empty. A real URL uuid is never replaced by a cached id. */
export function useStableChallengeRouteId(routeParam: unknown): { id: string; waiting: boolean } {
  const fromRoute = firstRouteParam(routeParam);
  const stableId = isChallengeRouteId(fromRoute) || fromRoute ? fromRoute : '';
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (stableId) {
      return;
    }
    setSettled(false);
    // One frame is all the router needs to populate `[id]`. If it is still empty after that the
    // link itself was malformed, so stop waiting and let the screen say the challenge is
    // unavailable rather than holding a spinner nothing will ever resolve.
    const frame = requestAnimationFrame(() => {
      setSettled(true);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [stableId]);

  return {
    id: stableId,
    waiting: !stableId && !settled,
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
