import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '@/hooks/useAuth';
import { useMyChallengeProgress } from '@/hooks/useChallenge';
import { fetchChallengeShareState } from '@/lib/challenges';
import { copy } from '@/lib/copy';
import { challengeTagAccess } from '@/lib/openChallengeFromTag';
import { challengeDetailHref } from '@/lib/routes';

export type OpenChallengeFromTagInput = {
  challengeId: string;
  visibility?: string | null;
  challenge_lane?: unknown;
  is_official?: boolean | null;
  created_by?: string | null;
  isParticipant?: boolean;
};

export function useOpenChallengeFromTag() {
  const router = useRouter();
  const { user } = useAuth();
  const mine = useMyChallengeProgress();

  return useCallback(
    async (input: OpenChallengeFromTagInput) => {
      const challengeId = input.challengeId?.trim();
      if (!challengeId) {
        return;
      }

      const row = mine.data?.find((item) => item.challenge_id === challengeId);
      const isParticipant = input.isParticipant ?? Boolean(row);
      const isHost = Boolean(user?.id && input.created_by && user.id === input.created_by);

      let shareHidden = false;
      const visibilityUnknown = input.visibility == null && input.challenge_lane == null;
      if (!isParticipant && !isHost && visibilityUnknown && !input.is_official) {
        const share = await fetchChallengeShareState(challengeId);
        if (share.reason === 'geo') {
          Alert.alert(copy('geo.unavailable'));
          return;
        }
        shareHidden = share.reason === 'hidden';
      }

      const access = challengeTagAccess({
        challengeId,
        visibility: input.visibility,
        challenge_lane: input.challenge_lane,
        is_official: input.is_official,
        isParticipant,
        isHost,
        shareHidden,
      });

      if (access === 'private') {
        Alert.alert(copy('challenge.privateWallTitle'), copy('challenge.privateWall'));
        return;
      }

      router.push(challengeDetailHref(challengeId, 'feed'));
    },
    [mine.data, router, user?.id],
  );
}
