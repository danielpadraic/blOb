import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { useLoggableChallenge } from '@/hooks/useLoggableChallenge';
import { useSubmitHealthWorkout } from '@/hooks/useWorkoutSubmission';
import { rankHealthWorkouts } from '@/lib/health/match';
import { challengeHealthWindow } from '@/lib/health/period';
import {
  fetchDismissedProviderWorkoutIds,
  fetchLatestWorkoutStart,
  fetchUsedProviderWorkoutIds,
} from '@/lib/health/remote';
import { syncNewHealthWorkouts } from '@/lib/health/sync';
import { getHealthProvider, type HealthWorkout } from '@/services/health';
import { readDismissedWorkoutIds, rememberDismissedWorkoutId } from '@/services/health/local';
import { dismissHealthWorkout } from '@/lib/health/remote';

export function useHealthLogPrompt() {
  const { user } = useAuth();
  const loggable = useLoggableChallenge();
  const submit = useSubmitHealthWorkout();
  const [workout, setWorkout] = useState<HealthWorkout | null>(null);
  const [busy, setBusy] = useState(false);

  const challenge = loggable.data;
  const available = Platform.OS === 'ios' && Boolean(getHealthProvider()?.isAvailable());

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
    if (!workout || !challenge) {
      return null;
    }
    setBusy(true);
    try {
      await submit.mutateAsync({ challengeId: challenge.id, workout });
      await rememberDismissedWorkoutId(workout.providerWorkoutId);
      const attachedTo = challenge.id;
      setWorkout(null);
      return attachedTo;
    } finally {
      setBusy(false);
    }
  }, [challenge, submit, workout]);

  return {
    workout,
    challenge,
    busy: busy || submit.isPending,
    accept,
    dismiss,
  };
}
