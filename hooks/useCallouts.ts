import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import {
  acceptCallout,
  cancelCallout,
  createCallout,
  declineCallout,
  fetchCallout,
  fetchCalloutProfiles,
  fetchMyCallouts,
  findProfileByUsername,
  submitCalloutResult,
} from '@/lib/callouts';
import { reportBadgeActivity } from '@/lib/badgeActivity';
import type { Callout, PublicProfile, WalletCurrency } from '@/lib/types';

function invalidateCallouts(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['callouts'] });
  void queryClient.invalidateQueries({ queryKey: ['profile'] });
  void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  void reportBadgeActivity();
}

export function useMyCallouts() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['callouts', user?.id],
    enabled: Boolean(user?.id),
    queryFn: fetchMyCallouts,
  });
}

export function useCallout(id?: string) {
  return useQuery({
    queryKey: ['callouts', 'one', id],
    enabled: Boolean(id),
    queryFn: () => fetchCallout(id!),
  });
}

export function useCalloutProfiles(callout?: Callout | null) {
  const ids = callout ? [callout.challenger_id, callout.opponent_id] : [];
  return useQuery({
    queryKey: ['callout-profiles', ...ids],
    enabled: ids.length === 2,
    queryFn: () => fetchCalloutProfiles(ids),
  });
}

export function useProfileByUsername(username?: string) {
  const handle = username?.trim().replace(/^@/, '') ?? '';
  return useQuery({
    queryKey: ['callout-username', handle],
    enabled: handle.length >= 2,
    queryFn: () => findProfileByUsername(handle),
  });
}

export function useCreateCallout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      opponentId: string;
      amount: number;
      currency: WalletCurrency;
      winCondition: string;
      deadline: string;
    }) => createCallout(input),
    onSuccess: () => invalidateCallouts(queryClient),
  });
}

export function useAcceptCallout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => acceptCallout(id),
    onSuccess: () => invalidateCallouts(queryClient),
  });
}

export function useDeclineCallout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => declineCallout(id),
    onSuccess: () => invalidateCallouts(queryClient),
  });
}

export function useSubmitCalloutResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; winnerId: string }) =>
      submitCalloutResult(input.id, input.winnerId),
    onSuccess: () => invalidateCallouts(queryClient),
  });
}

export function useCancelCallout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => cancelCallout(id),
    onSuccess: () => invalidateCallouts(queryClient),
  });
}

export function profileName(profile?: PublicProfile | null): string {
  if (!profile) {
    return 'Someone';
  }
  return profile.display_name?.trim() || profile.username;
}
