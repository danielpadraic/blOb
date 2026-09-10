import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { laterLiveTimestamp, peekLiveLastRead, writeLiveLastRead } from '@/lib/liveLastRead';
import { supabase } from '@/lib/supabase';

/**
 * The read cursor for one challenge Live thread.
 *
 * Memory + device storage are the source the thread paints from. The server row is a backup so a
 * new device can catch up. Sitting on latest writes “now” immediately so old Day 3–10 rows cannot
 * keep a New pill.
 */
export function useLiveThreadReads(challengeId?: string | null) {
  const { user } = useAuth();
  const userId = user?.id;
  const enabled = Boolean(challengeId && userId);

  const [cursor, setCursor] = useState<string | null>(() =>
    enabled ? peekLiveLastRead(userId, challengeId) : null,
  );
  const [ready, setReady] = useState(() => Boolean(peekLiveLastRead(userId, challengeId)));
  const savedRef = useRef<string | null>(cursor);

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      setCursor(null);
      savedRef.current = null;
      return;
    }
    const local = peekLiveLastRead(userId, challengeId);
    if (local) {
      setCursor(local);
      savedRef.current = local;
      setReady(true);
    }
    let cancelled = false;
    void (async () => {
      try {
        const { data } = await supabase
          .from('live_thread_reads')
          .select('last_read_at')
          .eq('user_id', userId!)
          .eq('challenge_id', challengeId!)
          .maybeSingle();
        if (cancelled) {
          return;
        }
        const remote = typeof data?.last_read_at === 'string' ? data.last_read_at : null;
        const next = writeLiveLastRead(userId, challengeId, laterLiveTimestamp(local, remote));
        setCursor(next);
        savedRef.current = next;
      } catch {
        if (!cancelled && !local) {
          setCursor(null);
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [challengeId, enabled, userId]);

  const persistRemote = useCallback(
    async (at: string | null) => {
      if (!enabled || !at) {
        return;
      }
      const previous = savedRef.current;
      if (previous && Date.parse(at) <= Date.parse(previous)) {
        return;
      }
      savedRef.current = at;
      try {
        await supabase
          .from('live_thread_reads')
          .upsert(
            { user_id: userId!, challenge_id: challengeId!, last_read_at: at },
            { onConflict: 'user_id,challenge_id' },
          );
      } catch {
        savedRef.current = previous;
      }
    },
    [challengeId, enabled, userId],
  );

  /** Forward-only. Used when the newest row is on screen. */
  const markRead = useCallback(
    (at: string | null) => {
      if (!enabled || !at) {
        return;
      }
      const next = writeLiveLastRead(userId, challengeId, at);
      if (!next) {
        return;
      }
      setCursor((current) => laterLiveTimestamp(current, next) ?? next);
      void persistRemote(next);
    },
    [challengeId, enabled, persistRemote, userId],
  );

  const seedIfMissing = useCallback(
    (newestAt: string | null) => {
      if (!enabled || peekLiveLastRead(userId, challengeId)) {
        return;
      }
      markRead(newestAt ?? new Date().toISOString());
    },
    [challengeId, enabled, markRead, userId],
  );

  return useMemo(
    () => ({
      baseline: cursor,
      cursor,
      ready,
      saveCursor: persistRemote,
      markRead,
      seedIfMissing,
    }),
    [cursor, markRead, persistRemote, ready, seedIfMissing],
  );
}
