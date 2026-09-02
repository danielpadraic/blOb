import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';

import { useAuth } from '@/hooks/useAuth';
import { useMyChallengeProgress } from '@/hooks/useChallenge';
import { fetchChallengeShareState } from '@/lib/challenges';
import { openChallengeLobby } from '@/lib/challengeOpen';
import type { ChallengeLoadSnapshot } from '@/lib/challengeLoad';
import { copy } from '@/lib/copy';
import { challengeTagAccess } from '@/lib/openChallengeFromTag';

export type OpenChallengeFromTagInput = {
  challengeId: string;
  visibility?: string | null;
  challenge_lane?: unknown;
  is_official?: boolean | null;
  created_by?: string | null;
  isParticipant?: boolean;
  snapshot?: ChallengeLoadSnapshot | null;
  postId?: string | null;
  tab?: 'overview' | 'board' | 'feed';
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
        try {
          const share = await fetchChallengeShareState(challengeId);
          if (share.reason === 'geo') {
            Alert.alert(copy('geo.unavailable'));
            return;
          }
          shareHidden = share.reason === 'hidden';
        } catch {
          // Transient share lookup must not block View on a card that already rendered.
        }
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

      openChallengeLobby(router, {
        id: challengeId,
        snapshot: input.snapshot ?? {
          id: challengeId,
          visibility: input.visibility,
          challenge_lane: input.challenge_lane,
          is_official: input.is_official,
          created_by: input.created_by,
        },
        returnTo: 'feed',
        postId: input.postId,
        extra: input.tab || input.postId ? { tab: input.tab ?? 'feed' } : undefined,
      });
    },
    [mine.data, router, user?.id],
  );
}
