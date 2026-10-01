import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  WorkoutProofCardRenderer,
  type WorkoutCardRequest,
} from '@/components/challenge/WorkoutProofCardRenderer';
import { useAuth } from '@/hooks/useAuth';
import { isHomeSocialFeedKey, liveListKey } from '@/hooks/useFeed';
import { parseChallengeProofs, type ChallengeProof } from '@/lib/challengeProofs';
import { challengeClockTz } from '@/lib/checkinPeriod';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import { type CardRepair } from '@/lib/health/cardRedraw';
import { pendingCardRepairs, putRepairedCard } from '@/lib/health/cardRedrawQueue';
import { onWorkoutCardRedraw } from '@/lib/health/cardRedrawSignal';
import { buildWorkoutProofCard } from '@/lib/health/workoutProofCard';
import { supabase } from '@/lib/supabase';

/**
 * Draws a posted workout proof card again when the stored picture no longer tells the truth.
 *
 * A card's stats are pixels in a JPEG, so neither the repair that fixed the distances nor the fix to
 * the renderer itself could change a card already sitting on someone's post. This mounts the same
 * off-screen renderer the check-in screen uses, draws each stale card from the summary already on the
 * check-in, and saves it through the ordinary check-in proof path — so the Live post and the Home post
 * both pick up the new image and the check-in keeps its submitted status.
 *
 * A slot whose card never rasterized gets one here for the first time, which is why a Health attach
 * that posted with only selfies ends up with its recap.
 *
 * Rasterizing an SVG to a file is native-only, so Web renders nothing here. Web already reads the
 * stored numbers for its chips, and a gallery OCR card is drawn on the check-in screen. A missing
 * Health recap is drawn on the owner's phone from the snapshot already saved — Apple is not asked
 * for a workout that has aged out.
 */
export function WorkoutCardRedrawHost() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [queue, setQueue] = useState<CardRepair[]>([]);
  const [request, setRequest] = useState<WorkoutCardRequest | null>(null);
  const activeRef = useRef<{
    item: CardRepair;
    proof: ChallengeProof;
  } | null>(null);
  const busyRef = useRef(false);
  const againRef = useRef(false);
  const userIdRef = useRef<string | null>(null);
  const loadRef = useRef<() => Promise<void>>(async () => undefined);

  const userId = user?.id;
  userIdRef.current = userId ?? null;

  const noteQueue = useCallback((next: CardRepair[]) => {
    if (next.length > 0) {
      return;
    }
    busyRef.current = false;
    if (againRef.current) {
      againRef.current = false;
      void loadRef.current();
    }
  }, []);

  const load = useCallback(async () => {
    const id = userIdRef.current;
    if (Platform.OS === 'web' || !id) {
      return;
    }
    if (busyRef.current) {
      againRef.current = true;
      return;
    }
    busyRef.current = true;
    try {
      const work = await pendingCardRepairs(id);
      if (work.length > 0) {
        setQueue(work);
        return;
      }
    } catch {
      // A card that keeps its old picture is not worth an error in front of the user.
    }
    busyRef.current = false;
  }, []);
  loadRef.current = load;

  useEffect(() => {
    if (Platform.OS === 'web' || !userId) {
      return;
    }
    void load();
    return onWorkoutCardRedraw(() => {
      void load();
    });
  }, [load, userId]);

  /** Drop the head of the queue without stamping it, so a skipped card is retried on a later open. */
  const skipHead = useCallback(() => {
    activeRef.current = null;
    setRequest(null);
    setQueue((current) => {
      const next = current.slice(1);
      noteQueue(next);
      return next;
    });
  }, [noteQueue]);

  useEffect(() => {
    if (Platform.OS === 'web' || request || activeRef.current || queue.length === 0) {
      return;
    }
    const item = queue[0];
    let cancelled = false;

    void (async () => {
      try {
        const challenge = await supabase
          .from('challenges')
          .select(CHALLENGE_COLUMNS)
          .eq('id', item.challengeId)
          .maybeSingle();
        if (cancelled) {
          return;
        }
        if (challenge.error || !challenge.data) {
          skipHead();
          return;
        }
        const row = challenge.data as ChallengeCardRow;

        const series = item.health.hrSeries ?? null;
        const card = buildWorkoutProofCard({
          workout: item.workout,
          series,
          timeZone: challengeClockTz(row),
          challengeTitle: challengeDisplayTitle(row),
          route: item.health.route ?? null,
        });
        const proof =
          parseChallengeProofs(row.proofs).find((entry) => entry.id === item.proofId) ??
          ({ id: item.proofId, name: '', method: item.method } satisfies ChallengeProof);
        activeRef.current = { item, proof };
        setRequest({
          key: `${item.proofId}-${item.checkinId}`,
          card,
          activityType: item.workout.activityType,
        });
      } catch {
        if (!cancelled) {
          skipHead();
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [queue, request, skipHead, userId]);

  const onRendered = useCallback(
    (key: string, fileUri: string) => {
      const active = activeRef.current;
      setRequest(null);
      if (!active || !key.startsWith(active.item.proofId)) {
        return;
      }
      const { item } = active;
      void (async () => {
        try {
          const saved = await putRepairedCard(item, fileUri);
          void queryClient.invalidateQueries({
            predicate: (query) => isHomeSocialFeedKey(query.queryKey),
          });
          void queryClient.invalidateQueries({ queryKey: liveListKey(item.challengeId, userId) });
          if (saved.siblingCheckinId) {
            void queryClient.invalidateQueries({
              predicate: (query) => query.queryKey[0] === 'live',
            });
          }
          activeRef.current = null;
          setQueue((current) => {
            const next = current.filter(
              (entry) =>
                entry.checkinId !== item.checkinId && entry.checkinId !== saved.siblingCheckinId,
            );
            noteQueue(next);
            return next;
          });
        } catch {
          // Unstamped, so the next open tries again. Chips and selfies stay.
          activeRef.current = null;
          setQueue((current) => {
            const next = current.slice(1);
            noteQueue(next);
            return next;
          });
        }
      })();
    },
    [noteQueue, queryClient, userId],
  );

  const onFailed = useCallback(
    (key: string) => {
      const active = activeRef.current;
      if (!active || !key.startsWith(active.item.proofId)) {
        setRequest(null);
        return;
      }
      skipHead();
    },
    [skipHead],
  );

  if (Platform.OS === 'web') {
    return null;
  }
  return <WorkoutProofCardRenderer request={request} onRendered={onRendered} onFailed={onFailed} />;
}

const CHALLENGE_COLUMNS =
  'id, title, task, tasks, extra_tasks, is_callout, win_condition, timezone, is_official, series_id, proofs';

type ChallengeCardRow = Parameters<typeof challengeDisplayTitle>[0] &
  Parameters<typeof challengeClockTz>[0] & { proofs?: unknown };
