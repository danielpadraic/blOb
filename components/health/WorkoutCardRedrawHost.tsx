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
import { redrawWouldLoseHeartRate, type CardRedraw } from '@/lib/health/cardRedraw';
import { clearCardRedraw, pendingCardRedraws } from '@/lib/health/cardRedrawQueue';
import {
  buildWorkoutProofCard,
  withHeartRateFloor,
  type HeartRateSample,
} from '@/lib/health/workoutProofCard';
import { supabase } from '@/lib/supabase';
import { getHealthProvider } from '@/services/health';

/**
 * Draws a stored workout proof card again when its numbers went stale.
 *
 * The distance on those cards is baked into a JPEG, so the repair that fixed the rows could not fix
 * the pictures. This mounts the same off-screen renderer the check-in screen uses, redraws each
 * flagged card from the summary already on the check-in, and replaces it through the ordinary
 * check-in proof path — so the Live post and the Home post both pick up the new image and the
 * check-in keeps its submitted status.
 *
 * Rasterizing an SVG to a file is native-only, so Web renders nothing here. Web already reads the
 * repaired numbers for its chips and its own on-screen card; only the stored JPEG waits for a phone.
 */
export function WorkoutCardRedrawHost() {
  const { user } = useAuth();
  const [queue, setQueue] = useState<CardRedraw[]>([]);
  const [request, setRequest] = useState<WorkoutCardRequest | null>(null);
  const activeRef = useRef<{ item: CardRedraw; proof: ChallengeProof } | null>(null);
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
        const work = await pendingCardRedraws(userId);
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

  /** Drop the head of the queue, leaving its flag alone so a skipped card is retried later. */
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

        const samples = await readHeartRateSeries(item);
        if (cancelled) {
          return;
        }
        // Trading a wrong distance for a missing heart-rate graph is not a repair. The flag stays
        // set, so the next open tries again once Health hands the samples over.
        if (redrawWouldLoseHeartRate(item.workout, samples.length)) {
          skipHead();
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
          key: `${item.proofId}-${item.sessionId}`,
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
          // The ordinary check-in proof path: it uploads the still, overwrites this one slot, and
          // rebuilds the post's media, so Live and Home both show the redrawn card. An already
          // submitted check-in stays submitted, because the slot is still satisfied.
          await saveCheckinProof({
            challengeId: item.challengeId,
            proof,
            uri: fileUri,
            mimeType: 'image/png',
            fromLibrary: false,
            health: item.health,
            healthWorkoutId: item.healthWorkoutId,
          });
          await clearCardRedraw(item.sessionId);
        } catch {
          // Leave the flag set. The old card stays on the post rather than the slot going empty.
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

async function readHeartRateSeries(item: CardRedraw): Promise<HeartRateSample[]> {
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
