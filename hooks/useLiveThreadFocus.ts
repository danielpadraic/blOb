import { useEffect, useRef } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { LIVE_FOCUS_HEARTBEAT_MS } from '@/lib/livePush';
import { supabase } from '@/lib/supabase';

/**
 * Tells the server this person is looking at this challenge's Live tab so OS push
 * for that thread is skipped (in-app insert still happens). Clears on blur, background, unmount.
 */
export function useLiveThreadFocus(challengeId?: string | null, focused?: boolean) {
  const { user } = useAuth();
  const userId = user?.id;
  const active = Boolean(challengeId && userId && focused);

  const pulse = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!active) {
      return;
    }

    let cancelled = false;

    async function write() {
      try {
        await supabase.from('live_thread_focus').upsert(
          {
            user_id: userId!,
            challenge_id: challengeId!,
            focused_at: new Date().toISOString(),
          },
          { onConflict: 'user_id,challenge_id' },
        );
      } catch {
        /* skip — missing table or offline must not break Live */
      }
    }

    async function clear() {
      try {
        await supabase
          .from('live_thread_focus')
          .delete()
          .eq('user_id', userId!)
          .eq('challenge_id', challengeId!);
      } catch {
        /* ignore */
      }
    }

    void write();
    pulse.current = setInterval(() => {
      if (!cancelled) {
        void write();
      }
    }, LIVE_FOCUS_HEARTBEAT_MS);

    function onApp(next: AppStateStatus) {
      if (next !== 'active') {
        void clear();
        return;
      }
      void write();
    }

    const sub = AppState.addEventListener('change', onApp);

    return () => {
      cancelled = true;
      if (pulse.current) {
        clearInterval(pulse.current);
        pulse.current = null;
      }
      sub.remove();
      void clear();
    };
  }, [active, challengeId, userId]);
}
