import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { useAuth } from '@/hooks/useAuth';
import { tickUserGrants } from '@/lib/grants';

export function useTickUserGrants(enabled: boolean) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const ticking = useRef(false);
  const userId = user?.id;

  useEffect(() => {
    if (!enabled || !userId) {
      return;
    }

    async function run() {
      if (ticking.current || !userId) {
        return;
      }
      ticking.current = true;
      try {
        await tickUserGrants();
        void queryClient.invalidateQueries({ queryKey: ['profile', userId] });
        void queryClient.invalidateQueries({ queryKey: ['notifications', userId] });
      } catch (error) {
        console.log('[blob:grants] tick failed', error);
      } finally {
        ticking.current = false;
      }
    }

    void run();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void run();
      }
    });
    return () => sub.remove();
  }, [enabled, queryClient, userId]);
}
