import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import {
  acquireChallengeBoardRealtime,
  isChallengeRealtimeId,
  releaseChallengeBoardRealtime,
} from '@/lib/challengeBoardRealtime';

/** `boardOnly` skips comments + reactions for a scoring-only room that has no Live of its own. */
export function useChallengeBoardRealtime(challengeId?: string, options?: { boardOnly?: boolean }) {
  const queryClient = useQueryClient();
  const boardOnly = Boolean(options?.boardOnly);
  const viewerId = useAuth().user?.id ?? null;
  const id = isChallengeRealtimeId(challengeId) ? challengeId.trim() : '';

  useEffect(() => {
    if (!id) {
      return;
    }
    acquireChallengeBoardRealtime(id, queryClient, undefined, viewerId, { boardOnly });
    return () => {
      releaseChallengeBoardRealtime(id);
    };
  }, [boardOnly, id, queryClient, viewerId]);
}
