import { useEffect, useRef } from 'react';

import { useTourOptional } from '@/components/tour/TourContext';
import { useMyProfile } from '@/hooks/useProfile';
import type { CreateTourTrack } from '@/lib/createTour';

export function useCreateChallengeTour(track: CreateTourTrack, enabled = true) {
  const tour = useTourOptional();
  const startCreate = tour?.startCreate;
  const stopCreate = tour?.stopCreate;
  const { profile, isFetched } = useMyProfile();
  const launched = useRef(false);

  useEffect(() => {
    if (!enabled || !startCreate || !isFetched || profile?.create_tour_opt_out_at || launched.current) {
      return;
    }
    launched.current = true;
    const handle = setTimeout(() => startCreate(track), 400);
    return () => clearTimeout(handle);
  }, [enabled, isFetched, profile?.create_tour_opt_out_at, startCreate, track]);

  useEffect(() => {
    return () => {
      stopCreate?.();
    };
  }, [stopCreate]);
}
