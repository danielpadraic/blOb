import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import {
  acceptCallout,
  cancelCallout,
  createCallout,
  declineCallout,
  fetchCallout,
  fetchCalloutByChallengeId,
  fetchCalloutCardParties,
  fetchCalloutObserverCandidates,
  fetchCalloutObservers,
  fetchCalloutOpponents,
  fetchCalloutProfiles,
  fetchMyCallouts,
  findProfileByUsername,
  inviteCalloutObserver,
  leaveCalloutWatch,
  pendingHomeCallouts,
  submitCalloutResult,
} from '@/lib/callouts';
import { HOME_PULSE_KEY } from '@/lib/homePulse';
import { reportBadgeActivity } from '@/lib/badgeActivity';
import type { Callout, PublicProfile, WalletCurrency } from '@/lib/types';

function invalidateCallouts(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['callouts'] });
  void queryClient.invalidateQueries({ queryKey: ['challenges'] });
  void queryClient.invalidateQueries({ queryKey: ['challenge'] });
  void queryClient.invalidateQueries({ queryKey: ['profile'] });
  void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  void queryClient.invalidateQueries({ queryKey: [HOME_PULSE_KEY] });
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

export function usePendingHomeCallouts() {
  const { user } = useAuth();
  const mine = useMyCallouts();
  return {
    ...mine,
    data: pendingHomeCallouts(mine.data, user?.id),
  };
}

export function useCalloutOpponents() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['callouts', 'opponents', user?.id],
    enabled: Boolean(user?.id),
    queryFn: () => fetchCalloutOpponents(user!.id),
  });
}

export function useCallout(id?: string) {
  return useQuery({
    queryKey: ['callouts', 'one', id],
    enabled: Boolean(id),
    queryFn: () => fetchCallout(id!),
  });
}

export function useCalloutCardParties(challengeIds: string[]) {
  const ids = [...new Set(challengeIds.map((id) => String(id ?? '').trim()).filter(Boolean))].sort();
  return useQuery({
    queryKey: ['callouts', 'card-parties', ids.join(',')],
    enabled: ids.length > 0,
    staleTime: 30_000,
    queryFn: () => fetchCalloutCardParties(ids),
  });
}

export function useCalloutForChallenge(challengeId?: string, enabled = true) {
  return useQuery({
    queryKey: ['callouts', 'challenge', challengeId],
    enabled: Boolean(challengeId) && enabled,
    queryFn: () => fetchCalloutByChallengeId(challengeId!),
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

export function useCalloutPinProfiles(rows: Callout[]) {
  const ids = [...new Set(rows.flatMap((row) => [row.challenger_id, row.opponent_id]))].sort();
  return useQuery({
    queryKey: ['callout-profiles', 'pin', ids.join(',')],
    enabled: ids.length > 0,
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

export function useCalloutObservers(calloutId?: string) {
  return useQuery({
    queryKey: ['callouts', 'observers', calloutId],
    enabled: Boolean(calloutId),
    queryFn: () => fetchCalloutObservers(calloutId!),
  });
}

export function useCalloutObserverCandidates(
  callout?: Pick<Callout, 'challenger_id' | 'opponent_id'> | null,
  alreadyWatching: string[] = [],
) {
  const { user } = useAuth();
  const watchingKey = [...alreadyWatching].sort().join(',');
  return useQuery({
    queryKey: ['callouts', 'observer-candidates', user?.id, callout?.challenger_id, callout?.opponent_id, watchingKey],
    enabled: Boolean(user?.id && callout),
    queryFn: () => fetchCalloutObserverCandidates(user!.id, callout!, alreadyWatching),
  });
}

export function useInviteCalloutObserver() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { calloutId: string; userId: string }) =>
      inviteCalloutObserver(input.calloutId, input.userId),
    onSuccess: () => invalidateCallouts(queryClient),
  });
}

export function useLeaveCalloutWatch() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: (calloutId: string) => leaveCalloutWatch(calloutId, user!.id),
    onSuccess: () => invalidateCallouts(queryClient),
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

export function profileName(
  profile?: Pick<PublicProfile, 'display_name' | 'username'> | null,
): string {
  if (!profile) {
    return 'Someone';
  }
  return profile.display_name?.trim() || profile.username;
}
