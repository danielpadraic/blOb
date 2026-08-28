import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import {
  acceptCircleInvite,
  circleInvitePushCopy,
  createCircle,
  declineCircleInvite,
  fetchCircleMembers,
  fetchCirclePage,
  fetchCirclePinCandidates,
  fetchCirclePins,
  fetchMyCircles,
  inviteToCircle,
  leaveCircle,
  pinChallengeToCircle,
  removeCircleMember,
  reorderCirclePins,
  shareChallengeToCircle,
  unpinCircleChallenge,
  updateCircleVisibility,
} from '@/lib/circles';
import { requestPushAfterValue } from '@/lib/push';
import { getOrCreateDirectConversation, personDisplayName, sendMessage } from '@/lib/social';
import { useMyProfile } from '@/hooks/useProfile';

function circlesKey(userId?: string | null) {
  return ['circles', userId] as const;
}

function circleKey(circleId?: string | null, userId?: string | null) {
  return ['circle', circleId, userId] as const;
}

function rosterKey(circleId?: string | null) {
  return ['circle-members', circleId] as const;
}

export function useMyCircles() {
  const { user } = useAuth();
  return useQuery({
    queryKey: circlesKey(user?.id),
    enabled: Boolean(user?.id),
    queryFn: () => fetchMyCircles(user!.id),
  });
}

export function useCircle(circleId?: string | null) {
  const { user } = useAuth();
  return useQuery({
    queryKey: circleKey(circleId, user?.id),
    enabled: Boolean(circleId),
    queryFn: () => fetchCirclePage(circleId!, user?.id),
  });
}

export function useCircleMembers(circleId?: string | null, enabled = true) {
  return useQuery({
    queryKey: rosterKey(circleId),
    enabled: Boolean(circleId) && enabled,
    queryFn: () => fetchCircleMembers(circleId!),
  });
}

export function useCreateCircle() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createCircle,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: circlesKey(user?.id) });
    },
  });
}

export function useInviteToCircle(circleId?: string, circleName?: string) {
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: { inviteeIds: string[]; postToFeed?: boolean }) => {
      if (!circleId) {
        throw new Error('Circle not found.');
      }
      if (!user) {
        throw new Error('You need to be signed in.');
      }
      const ids = [...new Set(input.inviteeIds.filter(Boolean))];
      if (ids.length === 0) {
        throw new Error('Pick someone to invite.');
      }
      const sent = await inviteToCircle({
        circleId,
        inviteeIds: ids,
        postToFeed: input.postToFeed,
      });
      const actor = personDisplayName(profile) || 'Someone';
      const body = circleInvitePushCopy(actor, circleName || 'this Circle');
      for (const inviteeId of ids) {
        try {
          const conversation = await getOrCreateDirectConversation(user.id, inviteeId);
          await sendMessage(user.id, {
            conversation_id: conversation.id,
            body,
          });
        } catch (error) {
          console.log('[blob:circles] dm skipped', error);
        }
      }
      requestPushAfterValue();
      return sent;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: circleKey(circleId, user?.id) });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useAcceptCircleInvite() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: acceptCircleInvite,
    onSettled: (_data, _error, circleId) => {
      void queryClient.invalidateQueries({ queryKey: circlesKey(user?.id) });
      void queryClient.invalidateQueries({ queryKey: circleKey(circleId, user?.id) });
      void queryClient.invalidateQueries({ queryKey: rosterKey(circleId) });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useDeclineCircleInvite() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: declineCircleInvite,
    onSettled: (_data, _error, circleId) => {
      void queryClient.invalidateQueries({ queryKey: circleKey(circleId, user?.id) });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useLeaveCircle() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: leaveCircle,
    onSettled: (_data, _error, circleId) => {
      void queryClient.invalidateQueries({ queryKey: circlesKey(user?.id) });
      void queryClient.invalidateQueries({ queryKey: circleKey(circleId, user?.id) });
      void queryClient.invalidateQueries({ queryKey: rosterKey(circleId) });
    },
  });
}

export function useUpdateCircleVisibility(circleId?: string) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (visibility: Parameters<typeof updateCircleVisibility>[1]) => {
      if (!circleId) {
        throw new Error('Circle not found.');
      }
      return updateCircleVisibility(circleId, visibility);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: circleKey(circleId, user?.id) });
      void queryClient.invalidateQueries({ queryKey: circlesKey(user?.id) });
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
  });
}

export function useRemoveCircleMember(circleId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => {
      if (!circleId) {
        throw new Error('Circle not found.');
      }
      return removeCircleMember(circleId, userId);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: rosterKey(circleId) });
      void queryClient.invalidateQueries({ queryKey: circleKey(circleId) });
    },
  });
}

function pinsKey(circleId?: string | null) {
  return ['circle-pins', circleId] as const;
}

export function useCirclePins(circleId?: string | null) {
  return useQuery({
    queryKey: pinsKey(circleId),
    enabled: Boolean(circleId),
    queryFn: () => fetchCirclePins(circleId!),
  });
}

export function useCirclePinCandidates(enabled = true) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['circle-pin-candidates', user?.id],
    enabled: enabled && Boolean(user?.id),
    queryFn: () => fetchCirclePinCandidates(user!.id),
  });
}

export function usePinChallengeToCircle(circleId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (challengeId: string) => {
      if (!circleId) {
        throw new Error('Circle not found.');
      }
      return pinChallengeToCircle(circleId, challengeId);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: pinsKey(circleId) });
    },
  });
}

export function useUnpinCircleChallenge(circleId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (challengeId: string) => {
      if (!circleId) {
        throw new Error('Circle not found.');
      }
      return unpinCircleChallenge(circleId, challengeId);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: pinsKey(circleId) });
    },
  });
}

export function useReorderCirclePins(circleId?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (challengeIds: string[]) => {
      if (!circleId) {
        throw new Error('Circle not found.');
      }
      return reorderCirclePins(circleId, challengeIds);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: pinsKey(circleId) });
    },
  });
}

export function useShareChallengeToCircle() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: shareChallengeToCircle,
    onSuccess: (_id, input) => {
      void queryClient.invalidateQueries({ queryKey: ['feed'] });
      void queryClient.invalidateQueries({ queryKey: ['circle', input.circleId, user?.id] });
    },
  });
}
