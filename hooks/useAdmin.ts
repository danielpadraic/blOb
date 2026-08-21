import { useQuery } from '@tanstack/react-query';

import {
  fetchAdminErrors,
  fetchAdminPulse,
  fetchAdminPulseList,
  type AdminPulseMetric,
  type AdminRange,
} from '@/lib/admin';
import { isAdminViewer } from '@/lib/official';
import { useMyProfile } from '@/hooks/useProfile';

export function useAdminAccess() {
  const { profile, isLoading, isBootstrapping } = useMyProfile();
  return {
    allowed: isAdminViewer(profile),
    loading: isLoading || isBootstrapping,
    profile,
  };
}

export function useAdminPulse(range: AdminRange, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-pulse', range],
    queryFn: () => fetchAdminPulse(range),
    enabled,
    staleTime: 15_000,
  });
}

export function useAdminPulseList(metric: AdminPulseMetric, range: AdminRange, enabled: boolean) {
  return useQuery({
    queryKey: ['admin-pulse-list', metric, range],
    queryFn: () => fetchAdminPulseList(metric, range),
    enabled,
  });
}

export function useAdminErrors(enabled: boolean) {
  return useQuery({
    queryKey: ['admin-errors'],
    queryFn: () => fetchAdminErrors(),
    enabled,
  });
}
