import { useEffect, useRef } from 'react';

import { useTourOptional } from '@/components/tour/TourContext';
import { useMyProfile } from '@/hooks/useProfile';
import type { CreateTourTrack } from '@/lib/createTour';

export function useCreateChallengeTour(track: CreateTourTrack, enabled = true) {
  const tour = useTourOptional();
  const { profile, isFetched } = useMyProfile();
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || !tour || started.current || !isFetched) {
      return;
    }
    if (profile?.create_tour_opt_out_at) {
      return;
    }
    started.current = true;
    const handle = setTimeout(() => tour.startCreate(track), 320);
    return () => {
      clearTimeout(handle);
      tour.stopCreate();
    };
  }, [enabled, isFetched, profile?.create_tour_opt_out_at, tour, track]);
}
