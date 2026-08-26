import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  acceptChallengeInvite,
  createChallengeInvite,
  declineChallengeInvite,
  fetchPendingChallengeInvites,
} from '@/lib/challengeInvites';

export function usePendingChallengeInvites(challengeId: string | undefined, enabled = true) {
  return useQuery({
    queryKey: ['challenge-invites', challengeId],
    enabled: Boolean(challengeId) && enabled,
    queryFn: () => fetchPendingChallengeInvites(challengeId!),
  });
}

export function useCreateChallengeInvite(challengeId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!challengeId) {
        throw new Error('Challenge not found.');
      }
      return createChallengeInvite(challengeId);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['challenge-invites', challengeId] });
    },
  });
}

export function useAcceptChallengeInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: acceptChallengeInvite,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['lobby-joined'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-discover'] });
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
    },
  });
}

export function useDeclineChallengeInvite() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: declineChallengeInvite,
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['lobby-joined'] });
      void queryClient.invalidateQueries({ queryKey: ['lobby-discover'] });
      void queryClient.invalidateQueries({ queryKey: ['challenges'] });
    },
  });
}
