import { useEffect, useRef } from 'react';

import { useTourOptional } from '@/components/tour/TourContext';
import {
  wasContextualTourSeen,
  type ContextualTourId,
  type ContextualTourStep,
} from '@/lib/contextualTour';

/** Surfaces request a first-seen coach. One overlay in the tab tour layer plays it. */
export function useContextualTour(
  id: ContextualTourId,
  steps: ContextualTourStep[],
  enabled: boolean,
  userId?: string | null,
) {
  const tour = useTourOptional();
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const requestContextual = tour?.requestContextual;
  const blocked = Boolean(tour?.active || tour?.createActive || tour?.contextual);

  useEffect(() => {
    if (!enabled || !userId || !requestContextual || blocked) {
      return;
    }
    if (wasContextualTourSeen(userId, id)) {
      return;
    }
    const next = stepsRef.current;
    if (next.length === 0) {
      return;
    }
    requestContextual({ id, steps: next, userId });
  }, [blocked, enabled, id, requestContextual, userId]);
}
