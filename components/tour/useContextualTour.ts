import { useEffect, useRef, useState } from 'react';

import { useProfile } from '@/hooks/useProfile';
import { useTourOptional } from '@/components/tour/TourContext';
import {
  hydrateContextualTours,
  wasContextualTourSeen,
  type ContextualTourId,
  type ContextualTourStep,
} from '@/lib/contextualTour';
import { hydrateHomeTour } from '@/lib/homeTour';

/** Surfaces request a first-seen coach. One overlay in the tab tour layer plays it. */
export function useContextualTour(
  id: ContextualTourId,
  steps: ContextualTourStep[],
  enabled: boolean,
  userId?: string | null,
) {
  const tour = useTourOptional();
  const profile = useProfile(userId ?? undefined);
  const [hydrated, setHydrated] = useState(false);
  const stepsRef = useRef(steps);
  stepsRef.current = steps;
  const requestContextual = tour?.requestContextual;
  const blocked = Boolean(tour?.active || tour?.createActive || tour?.contextual);

  useEffect(() => {
    if (!userId) {
      setHydrated(false);
      return;
    }
    let alive = true;
    void Promise.all([hydrateContextualTours(userId), hydrateHomeTour(userId)]).then(() => {
      if (alive) {
        setHydrated(true);
      }
    });
    return () => {
      alive = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!enabled || !userId || !requestContextual || blocked || !hydrated) {
      return;
    }
    if (profile.isLoading && !profile.data) {
      return;
    }
    if (wasContextualTourSeen(userId, id, profile.data)) {
      return;
    }
    const next = stepsRef.current;
    if (next.length === 0) {
      return;
    }
    requestContextual({ id, steps: next, userId });
  }, [blocked, enabled, hydrated, id, profile.data, profile.isLoading, requestContextual, userId]);
}
