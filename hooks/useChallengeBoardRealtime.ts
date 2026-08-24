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

    const refreshSettlement = () => {
      void queryClient.invalidateQueries({ queryKey: ['challenge', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['challenge-settlement', challengeId] });
      void queryClient.invalidateQueries({ queryKey: ['wallet-ledger'] });
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      refreshBoard();
      refreshFeed();
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
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'challenges',
          filter: `id=eq.${challengeId}`,
        },
        refreshSettlement,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'challenge_settlements',
          filter: `challenge_id=eq.${challengeId}`,
        },
        refreshSettlement,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'challenge_payouts',
          filter: `challenge_id=eq.${challengeId}`,
        },
        refreshSettlement,
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['notifications'] });
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'wallet_ledger',
        },
        () => {
          void queryClient.invalidateQueries({ queryKey: ['wallet-ledger'] });
          void queryClient.invalidateQueries({ queryKey: ['profile'] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [challengeId, queryClient]);
}
