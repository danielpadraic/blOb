import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import {
  createLiveCounter,
  deleteCounter,
  fetchCounter,
  fetchLiveCounters,
  fetchSavedCounters,
  resolveLastLiveCounterId,
  saveCounterDraft,
  setCounterCardUrl,
  snapshotCounter,
  touchCounterOpened,
} from '@/lib/counter/api';
import type { CounterDraft, CounterKind } from '@/lib/counter/types';

export const COUNTER_KEY = 'counter';

export function useLiveCounters() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [COUNTER_KEY, 'live', user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchLiveCounters(),
  });
}

export function useSavedCounters() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [COUNTER_KEY, 'saved', user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchSavedCounters(),
  });
}

export function useCounter(id: string | null | undefined) {
  const { user } = useAuth();
  const counterId = String(id ?? '').trim();
  return useQuery({
    queryKey: [COUNTER_KEY, 'one', counterId, user?.id],
    enabled: Boolean(counterId && user?.id),
    queryFn: () => fetchCounter(counterId),
  });
}

export function useCreateCounter() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: { title?: string; counterDate?: string; metrics: { name: string; kind: CounterKind }[] }) =>
      createLiveCounter(input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [COUNTER_KEY] });
    },
  });
}

export function useSaveCounter() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (draft: CounterDraft) => saveCounterDraft(draft),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [COUNTER_KEY] });
    },
  });
}

export function useSnapshotCounter() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (draft: CounterDraft) => snapshotCounter(draft),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [COUNTER_KEY] });
    },
  });
}

export function useSetCounterCardUrl() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, cardUrl }: { id: string; cardUrl: string }) => setCounterCardUrl(id, cardUrl),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [COUNTER_KEY] });
    },
  });
}

export function useLastLiveCounterId() {
  const { user } = useAuth();
  return useQuery({
    queryKey: [COUNTER_KEY, 'last', user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => resolveLastLiveCounterId(),
  });
}

export function useTouchCounterOpened() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => touchCounterOpened(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [COUNTER_KEY, 'live'] });
      void client.invalidateQueries({ queryKey: [COUNTER_KEY, 'last'] });
    },
  });
}

export function useDeleteCounter() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteCounter(id),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: [COUNTER_KEY] });
    },
  });
}
