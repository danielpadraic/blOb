import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { acceptChallengeInvite, stashPendingInviteToken } from '@/lib/challengeInvites';
import { firstRouteParam } from '@/lib/challengeLoad';
import { getInviteAcceptMessage } from '@/utils/errors';

export function inviteTokenFromParam(value: unknown): string {
  return firstRouteParam(value);
}

export function useChallengeInviteLink(challengeId: string | undefined, token: string) {
  const { user } = useAuth();
  const { path } = useMyProfile();
  const router = useRouter();
  const queryClient = useQueryClient();
  const startedFor = useRef<string | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }
    void stashPendingInviteToken(token, challengeId);
  }, [challengeId, token]);

  useEffect(() => {
    if (!token || !challengeId) {
      return;
    }
    if (!user) {
      void stashPendingInviteToken(token, challengeId);
      router.replace('/(auth)/login');
      return;
    }
    if (path !== 'app') {
      return;
    }
    const key = `${challengeId}:${token}:${user.id}`;
    if (startedFor.current === key) {
      return;
    }
    startedFor.current = key;
    setClaiming(true);
    setClaimError(null);
    void acceptChallengeInvite(token)
      .then(() => {
        setClaimed(true);
        void queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
        void queryClient.invalidateQueries({ queryKey: ['challenge-participants', challengeId] });
        void queryClient.invalidateQueries({ queryKey: ['my-participation', challengeId] });
      })
      .catch((error) => {
        setClaimError(getInviteAcceptMessage(error));
      })
      .finally(() => {
        setClaiming(false);
      });
  }, [challengeId, path, queryClient, router, token, user]);

  return {
    token,
    needsAuth: Boolean(token && !user),
    claiming: Boolean(token && user && path === 'app' && claiming),
    closed: Boolean(token && claimError),
    closedMessage: claimError,
    ready: !token || claimed,
  };
}
