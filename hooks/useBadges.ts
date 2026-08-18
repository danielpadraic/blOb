import { useQuery } from '@tanstack/react-query';

import { fetchBadgeCatalog, fetchBadgeProgress } from '@/lib/badges';

export function useBadgeCatalog() {
  return useQuery({
    queryKey: ['badges', 'catalog'],
    queryFn: fetchBadgeCatalog,
    staleTime: 60_000,
  });
}

export function useBadgeProgress(userId?: string) {
  return useQuery({
    queryKey: ['badges', 'user', userId],
    enabled: Boolean(userId),
    queryFn: () => fetchBadgeProgress(userId!),
    staleTime: 15_000,
  });
}
