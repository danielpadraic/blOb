import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  acquireChallengeBoardRealtime,
  isChallengeRealtimeId,
  releaseChallengeBoardRealtime,
} from '@/lib/challengeBoardRealtime';

export function useChallengeBoardRealtime(challengeId?: string) {
  const queryClient = useQueryClient();
  const id = isChallengeRealtimeId(challengeId) ? challengeId.trim() : '';

  useEffect(() => {
    if (!id) {
      return;
    }
    acquireChallengeBoardRealtime(id, queryClient);
    return () => {
      releaseChallengeBoardRealtime(id);
    };
  }, [id, queryClient]);
}
