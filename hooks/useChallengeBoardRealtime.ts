import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { supabase } from '@/lib/supabase';

export function useChallengeBoardRealtime(challengeId?: string) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!challengeId) {
      return;
    }

    const refreshBoard = () => {
      void queryClient.invalidateQueries({ queryKey: ['challenge-participants', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['my-participation', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['submitted-checkins', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['challenge-completions', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['logged-workout-days', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['my-challenge-progress'] });
    };

    const refreshFeed = () => {
      void queryClient.invalidateQueries({ queryKey: ['feed', challengeId] });
    };

    const channel = supabase
      .channel(`challenge-board:${challengeId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'challenge_participants',
          filter: `challenge_id=eq.${challengeId}`,
        },
        refreshBoard,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'challenge_checkins',
          filter: `challenge_id=eq.${challengeId}`,
        },
        refreshBoard,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'posts',
          filter: `challenge_id=eq.${challengeId}`,
        },
        refreshFeed,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [challengeId, queryClient]);
}
