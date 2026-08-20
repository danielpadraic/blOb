import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { usePeriodCheckin, useSaveCheckinProof } from '@/hooks/useChallengeCheckin';
import { useLoggableChallenge } from '@/hooks/useLoggableChallenge';
import { requiredChallengeProofs } from '@/lib/challenges';
import { rankHealthWorkouts } from '@/lib/health/match';
import { challengeHealthWindow } from '@/lib/health/period';
import {
  fetchDismissedProviderWorkoutIds,
  fetchLatestWorkoutStart,
  fetchUsedProviderWorkoutIds,
  upsertHealthWorkout,
} from '@/lib/health/remote';
import { syncNewHealthWorkouts } from '@/lib/health/sync';
import { supabase } from '@/lib/supabase';
import { getHealthProvider, type HealthWorkout } from '@/services/health';
import { readDismissedWorkoutIds, rememberDismissedWorkoutId } from '@/services/health/local';
import { dismissHealthWorkout } from '@/lib/health/remote';

export function useHealthLogPrompt() {
  const { user } = useAuth();
  const loggable = useLoggableChallenge();
  const challenge = loggable.data;
  const periodCheckin = usePeriodCheckin(challenge?.id, challenge);
  const saveProof = useSaveCheckinProof(challenge?.id);
  const [workout, setWorkout] = useState<HealthWorkout | null>(null);
  const [busy, setBusy] = useState(false);

  const available = Platform.OS === 'ios' && Boolean(getHealthProvider()?.isAvailable());
  const phase = periodCheckin.data?.phase ?? 'none';

  const scan = useCallback(async () => {
    if (!user || !available || busy) {
      return;
    }
    try {
      const provider = getHealthProvider();
      if (!provider) {
        return;
      }
      const native = await provider.getAuthStatus();
      if (native === 'denied') {
        return;
      }
      const synced = await syncNewHealthWorkouts(user.id);
      if (!challenge) {
        return;
      }
      const period = challengeHealthWindow({
        frequency: challenge.frequency,
        starts_at: challenge.starts_at,
      });
      const periodRows = (await provider.fetchWorkouts(period)) ?? [];
      const byId = new Map<string, HealthWorkout>();
      for (const row of [...synced, ...periodRows]) {
        byId.set(row.providerWorkoutId, row);
      }
      const ranged = [...byId.values()];
      const [used, dismissedRemote, dismissedLocal, lastStart] = await Promise.all([
        fetchUsedProviderWorkoutIds(user.id),
        fetchDismissedProviderWorkoutIds(user.id),
        readDismissedWorkoutIds(),
        fetchLatestWorkoutStart(user.id, challenge.id),
      ]);
      const skip = new Set([...used, ...dismissedRemote, ...dismissedLocal]);
      const ranked = rankHealthWorkouts(ranged, {
        period,
        minMinutes: challenge.min_minutes,
        usedIds: skip,
        preferStartedAfter: lastStart,
      });
      if (ranked[0] && ranked[0].providerWorkoutId !== workout?.providerWorkoutId) {
        setWorkout(ranked[0]);
      }
    } catch {
      // Foreground prompt is optional. Camera log still works.
    }
  }, [available, busy, challenge, user, workout]);

  useEffect(() => {
    if (!available) {
      return;
    }
    void scan();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void scan();
      }
    });
    return () => sub.remove();
  }, [available, scan]);

  const dismiss = useCallback(async () => {
    if (workout) {
      await rememberDismissedWorkoutId(workout.providerWorkoutId);
      if (user) {
        try {
          await dismissHealthWorkout(user.id, workout);
        } catch {
          // Local dismiss is enough to stop nagging this session.
        }
      }
    }
    setWorkout(null);
  }, [user, workout]);

  const accept = useCallback(async () => {
    if (!workout || !challenge || !user) {
      return null;
    }
    setBusy(true);
    try {
      if (phase !== 'none' && phase !== 'submitted') {
        const { data } = await supabase
          .from('challenges')
          .select('proofs, proof_type, proof_requirements, challenge_type, tasks, min_minutes')
          .eq('id', challenge.id)
          .maybeSingle();
        const hrProof = requiredChallengeProofs(data).find((proof) => proof.method === 'hr');
        if (hrProof) {
          const provider = getHealthProvider();
          const enriched = provider?.enrichHeartRate ? await provider.enrichHeartRate(workout) : workout;
          const healthWorkoutId = await upsertHealthWorkout(user.id, enriched);
          await saveProof.mutateAsync({
            challengeId: challenge.id,
            proof: hrProof,
            uri: `health:${healthWorkoutId}`,
          });
        }
        await rememberDismissedWorkoutId(workout.providerWorkoutId);
        setWorkout(null);
      }
      return challenge.id;
    } finally {
      setBusy(false);
    }
  }, [challenge, phase, saveProof, user, workout]);

  return {
    workout,
    challenge,
    phase,
    busy: busy || saveProof.isPending,
    accept,
    dismiss,
  };
}
