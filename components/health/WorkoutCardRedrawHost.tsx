import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import {
  WorkoutProofCardRenderer,
  type WorkoutCardRequest,
} from '@/components/challenge/WorkoutProofCardRenderer';
import { useAuth } from '@/hooks/useAuth';
import { parseChallengeProofs, type ChallengeProof } from '@/lib/challengeProofs';
import { saveCheckinProof } from '@/lib/challenges/stagedCheckin';
import { challengeClockTz } from '@/lib/checkinPeriod';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import { type CardRepair } from '@/lib/health/cardRedraw';
import { pendingCardRepairs, putRepairedCard } from '@/lib/health/cardRedrawQueue';
import { ensureCheckinWaveForRepair } from '@/lib/checkinWave';
import {
  buildWorkoutProofCard,
  withHeartRateFloor,
  type HeartRateSample,
} from '@/lib/health/workoutProofCard';
import { supabase } from '@/lib/supabase';
import { getHealthProvider } from '@/services/health';

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
 * repaired numbers for its chips; only the stored JPEG waits for a phone. And because check-ins are
 * owner-scoped, each person's cards are drawn on their own device — nobody repairs anybody else's.
 */
export function WorkoutCardRedrawHost() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<CardRepair[]>([]);
  const [request, setRequest] = useState<WorkoutCardRequest | null>(null);
  const activeRef = useRef<{ item: CardRepair; proof: ChallengeProof } | null>(null);
  const loadedForRef = useRef<string | null>(null);

  const userId = user?.id;

  useEffect(() => {
    if (Platform.OS === 'web' || !userId || loadedForRef.current === userId) {
      return;
    }
    loadedForRef.current = userId;
    let cancelled = false;
    void (async () => {
      try {
        const work = await pendingCardRepairs(userId);
        if (!cancelled && work.length > 0) {
          setQueue(work);
        }
      } catch {
        // A card that keeps its old picture is not worth an error in front of the user.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  /** Drop the head of the queue without stamping it, so a skipped card is retried on a later open. */
  const skipHead = useCallback(() => {
    activeRef.current = null;
    setRequest(null);
    setQueue((current) => current.slice(1));
  }, []);

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

        // The sample series lives on the device, not in the row, and it only feeds the sparkline.
        // Health is asked for it so the graph survives, but a card is drawn either way: a stated
        // average with no graph is a smaller loss than leaving a wrong distance on a proof artifact,
        // and waiting for samples that may never come would mean never fixing the number.
        const samples = await readHeartRateSeries(item);
        if (cancelled) {
          return;
        }

        const workout = withHeartRateFloor(item.workout, samples);
        const card = buildWorkoutProofCard({
          workout,
          samples,
          timeZone: challengeClockTz(row),
          challengeTitle: challengeDisplayTitle(row),
          route: item.health.route ?? null,
        });
        // Saved against the challenge's own definition of the slot rather than a shape invented here.
        const proof =
          parseChallengeProofs(row.proofs).find((entry) => entry.id === item.proofId) ??
          ({ id: item.proofId, name: '', method: item.method } satisfies ChallengeProof);
        activeRef.current = { item: { ...item, workout }, proof };
        setRequest({
          key: `${item.proofId}-${item.checkinId}`,
          card,
          activityType: workout.activityType,
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
  }, [queue, request, skipHead]);

  const onRendered = useCallback(
    (key: string, fileUri: string) => {
      const active = activeRef.current;
      setRequest(null);
      if (!active || !key.startsWith(active.item.proofId)) {
        return;
      }
      const { item, proof } = active;
      void (async () => {
        try {
          // Uploads the card and swaps it onto this one slot of this one check-in, rebuilding the
          // post's media so Live and Home both show it. The check-in keeps its status, its health
          // snapshot and its caption, and the version stamp is what stops the card being picked up
          // again on the next open.
          const url = await putRepairedCard(item, fileUri);
          if (userId) {
            await ensureCheckinWaveForRepair({
              userId,
              challengeId: item.challengeId,
              url,
              previousUrl: item.previousUrl,
            }).catch(() => undefined);
          }
        } catch {
          // Unstamped, so it is tried again. The old card stays on the post rather than going empty.
        } finally {
          activeRef.current = null;
          setQueue((current) => current.slice(1));
        }
      })();
    },
    [],
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

async function readHeartRateSeries(item: CardRepair): Promise<HeartRateSample[]> {
  if (!item.health.startedAt || !item.health.endedAt) {
    return [];
  }
  try {
    const provider = getHealthProvider();
    return provider?.fetchHeartRateSeries
      ? await provider.fetchHeartRateSeries({
          startedAt: item.health.startedAt,
          endedAt: item.health.endedAt,
        })
      : [];
  } catch {
    return [];
  }
}
