import { formatDistanceToNow } from 'date-fns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Platform } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { asCopyTone, copy } from '@/lib/copy';
import { fetchHealthConnection, upsertHealthConnection } from '@/lib/health/remote';
import { getHealthProvider } from '@/services/health';
import { getErrorMessage } from '@/utils/errors';

export type HealthRowStatus = 'connected' | 'not_connected' | 'unavailable' | 'needs_install';

type HealthRow = {
  status: HealthRowStatus;
  lastSyncedAt: string | null;
  lastError: string | null;
};

export function useHealthAvailable() {
  return Boolean(getHealthProvider()?.isAvailable());
}

export function useHealthConnection() {
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const tone = asCopyTone(profile?.motivation_tone);
  const queryClient = useQueryClient();
  const showRow = Platform.OS === 'ios' || Platform.OS === 'android';
  const available = useHealthAvailable();

  const query = useQuery({
    queryKey: ['health-connection', user?.id, Platform.OS],
    enabled: Boolean(user?.id && showRow),
    queryFn: async (): Promise<HealthRow> => {
      const empty: HealthRow = { status: 'unavailable', lastSyncedAt: null, lastError: null };
      const provider = getHealthProvider();
      if (!provider) {
        return empty;
      }
      const detail = await provider.getAvailabilityDetail?.();
      if (detail === 'unavailable') {
        return empty;
      }
      if (detail === 'needs_install' || detail === 'needs_update') {
        return { status: 'needs_install', lastSyncedAt: null, lastError: null };
      }
      const native = await provider.getAuthStatus();
      const remote = user ? await fetchHealthConnection(user.id) : null;
      if (native === 'denied') {
        return { status: 'not_connected', lastSyncedAt: remote?.last_synced_at ?? null, lastError: remote?.last_error ?? null };
      }
      if (native === 'connected' || remote?.status === 'connected') {
        return {
          status: 'connected',
          lastSyncedAt: remote?.last_synced_at ?? null,
          lastError: remote?.last_error ?? null,
        };
      }
      return {
        status: 'not_connected',
        lastSyncedAt: remote?.last_synced_at ?? null,
        lastError: remote?.last_error ?? null,
      };
    },
  });

  const connect = useMutation({
    mutationFn: async (): Promise<HealthRow> => {
      const provider = getHealthProvider();
      if (!provider) {
        return { status: 'unavailable', lastSyncedAt: null, lastError: null };
      }
      const detail = await provider.getAvailabilityDetail?.();
      const result = await provider.requestAccess();
      if (result === 'unavailable') {
        if (detail === 'needs_install' || detail === 'needs_update') {
          return { status: 'needs_install', lastSyncedAt: null, lastError: null };
        }
        return { status: 'unavailable', lastSyncedAt: null, lastError: null };
      }
      if (result === 'denied') {
        if (user) {
          await upsertHealthConnection({ userId: user.id, status: 'disconnected' });
        }
        return { status: 'not_connected', lastSyncedAt: null, lastError: null };
      }
      if (user) {
        await upsertHealthConnection({ userId: user.id, status: 'connected' });
      }
      return { status: 'connected', lastSyncedAt: new Date().toISOString(), lastError: null };
    },
    onSuccess: (row) => {
      queryClient.setQueryData(['health-connection', user?.id, Platform.OS], row);
    },
  });

  const disconnect = useMutation({
    mutationFn: async () => {
      await getHealthProvider()?.disconnectLocal();
      if (user) {
        await upsertHealthConnection({ userId: user.id, status: 'disconnected' });
      }
    },
    onSuccess: () => {
      queryClient.setQueryData(['health-connection', user?.id, Platform.OS], {
        status: 'not_connected',
        lastSyncedAt: null,
        lastError: null,
      });
    },
    onError: (error) => {
      throw new Error(getErrorMessage(error));
    },
  });

  const row = query.data;
  const status: HealthRowStatus = !showRow
    ? 'unavailable'
    : !available && row?.status !== 'needs_install'
      ? (row?.status ?? 'unavailable')
      : (row?.status ?? 'not_connected');

  const title = Platform.OS === 'android' ? copy('health.rowAndroid') : copy('health.row');
  const subtitle =
    status === 'connected'
      ? copy('health.connected')
      : status === 'needs_install'
        ? copy('health.installSubtitle')
        : status === 'unavailable'
          ? copy('health.unavailable')
          : copy('health.notConnected');
  const lastSyncedLabel =
    Platform.OS === 'ios' && status === 'connected' && row?.lastSyncedAt
      ? copy('health.lastSynced', tone, {
          when: formatDistanceToNow(new Date(row.lastSyncedAt), { addSuffix: true }),
        })
      : null;

  return {
    available,
    showRow,
    title,
    helper: Platform.OS === 'android' ? copy('health.androidHelper') : Platform.OS === 'ios' ? copy('health.reads') : null,
    lastSyncedLabel,
    lastError: Platform.OS === 'ios' ? row?.lastError ?? null : null,
    status,
    subtitle,
    isLoading: query.isLoading,
    refetch: query.refetch,
    connect: connect.mutateAsync,
    disconnect: disconnect.mutateAsync,
    connecting: connect.isPending,
    disconnecting: disconnect.isPending,
  };
}
