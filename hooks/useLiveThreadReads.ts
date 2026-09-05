import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

/**
 * The read cursor for one challenge Live thread.
 *
 * `baseline` is the cursor as it stood when this visit began, and it deliberately never changes while
 * the thread is open — the "N new since you were here" count is measured against it, so letting it
 * follow our own writes would make the chip erase itself.
 *
 * A person with no stored cursor has never opened this thread. That is seeded immediately and
 * `baseline` stays null for the visit, so the chip does not greet a first-time reader by calling the
 * entire backlog unread.
 */
export function useLiveThreadReads(challengeId?: string | null) {
  const { user } = useAuth();
  const userId = user?.id;
  const enabled = Boolean(challengeId && userId);

  const [baseline, setBaseline] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  /** Last value written, so repeated saves of the same cursor do not hit the network. */
  const savedRef = useRef<string | null>(null);
  const seededRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      setBaseline(null);
      savedRef.current = null;
      seededRef.current = false;
      return;
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
        const cursor = typeof data?.last_read_at === 'string' ? data.last_read_at : null;
        setBaseline(cursor);
        savedRef.current = cursor;
        seededRef.current = Boolean(cursor);
      } catch {
        // A cursor we cannot read means no chip this visit. Never block the thread on it.
        if (!cancelled) {
          setBaseline(null);
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

  /**
   * Moves the stored cursor forward. Older values are ignored here and clamped again by the table's
   * forward-only trigger, so a late write from a backgrounded tab cannot reopen read messages.
   */
  const saveCursor = useCallback(
    async (cursor: string | null) => {
      if (!enabled || !cursor) {
        return;
      }
      const previous = savedRef.current;
      if (previous && Date.parse(cursor) <= Date.parse(previous)) {
        return;
      }
      savedRef.current = cursor;
      try {
        await supabase
          .from('live_thread_reads')
          .upsert(
            { user_id: userId!, challenge_id: challengeId!, last_read_at: cursor },
            { onConflict: 'user_id,challenge_id' },
          );
      } catch {
        // Losing a cursor write costs a repeated chip next visit, which is the safe direction.
        savedRef.current = previous;
      }
    },
    [challengeId, enabled, userId],
  );

  /** Gives a first-time reader a starting point so their next visit can measure "new". */
  const seedIfMissing = useCallback(
    (newestAt: string | null) => {
      if (!enabled || seededRef.current) {
        return;
      }
      seededRef.current = true;
      void saveCursor(newestAt ?? new Date().toISOString());
    },
    [enabled, saveCursor],
  );

  // Memoized so callers can depend on this object without re-running their effects every render.
  return useMemo(
    () => ({ baseline, ready, saveCursor, seedIfMissing }),
    [baseline, ready, saveCursor, seedIfMissing],
  );
}
