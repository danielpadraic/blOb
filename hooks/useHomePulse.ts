import { useQuery } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { withSatelliteTimeout } from '@/lib/homeFeed';
import { fetchHomePulsePills, HOME_PULSE_KEY, type PulsePill } from '@/lib/homePulse';

export function homePulseQueryKey(userId?: string) {
  return [HOME_PULSE_KEY, userId] as const;
}

/** Isolated from Home posts. A miss hides Pulse — it never empties the feed. */
export function useHomePulse() {
  const { user } = useAuth();
  return useQuery({
    queryKey: homePulseQueryKey(user?.id),
    enabled: Boolean(user?.id),
    retry: false,
    staleTime: 15_000,
    queryFn: async (): Promise<PulsePill[]> => {
      try {
        return await withSatelliteTimeout(fetchHomePulsePills(user!.id), []);
      } catch {
        return [];
      }
    },
  });
}
