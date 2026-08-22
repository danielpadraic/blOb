import { useCallback, useEffect, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { usePeriodCheckin } from '@/hooks/useChallengeCheckin';
import { useLoggableChallenge } from '@/hooks/useLoggableChallenge';
import { formatHealthDuration } from '@/lib/health/proofSummary';
import { rankHealthWorkouts } from '@/lib/health/match';
import { notifyForgotToBegin } from '@/lib/health/localNudges';
import { challengeHealthWindow, meetsMinMinutes } from '@/lib/health/period';
import {
  dismissHealthWorkout,
  fetchBeginNotifiedProviderWorkoutIds,
  fetchDismissedProviderWorkoutIds,
  fetchLatestWorkoutStart,
  fetchUsedProviderWorkoutIds,
  markHealthWorkoutBeginNotified,
} from '@/lib/health/remote';
import { syncNewHealthWorkouts } from '@/lib/health/sync';
import { getHealthProvider, type HealthWorkout } from '@/services/health';
import {
  readBeginNotifiedWorkoutIds,
  readDismissedWorkoutIds,
  rememberBeginNotifiedWorkoutId,
  rememberDismissedWorkoutId,
} from '@/services/health/local';

export function useHealthLogPrompt() {
  const { user } = useAuth();
  const loggable = useLoggableChallenge();
  const challenge = loggable.data;
  const periodCheckin = usePeriodCheckin(challenge?.id, challenge);
  const [workout, setWorkout] = useState<HealthWorkout | null>(null);

  const available = Platform.OS === 'ios' && Boolean(getHealthProvider()?.isAvailable());
  const phase = periodCheckin.data?.phase ?? 'none';

  const scan = useCallback(async () => {
    if (!user || !available || !challenge) {
      return;
    }
    if (phase !== 'none') {
      setWorkout(null);
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
      const period = challengeHealthWindow({
        frequency: challenge.frequency,
        starts_at: challenge.starts_at,
        is_official: challenge.is_official,
        series_id: challenge.series_id,
        status: challenge.status,
        timezone: challenge.timezone,
        days_required: challenge.days_required,
        day_windows: challenge.day_windows,
      });
      if (period.to.getTime() <= period.from.getTime()) {
        return;
      }
      const periodRows = (await provider.fetchWorkouts(period)) ?? [];
      const byId = new Map<string, HealthWorkout>();
      for (const row of [...synced, ...periodRows]) {
        byId.set(row.providerWorkoutId, row);
      }
      const ranged = [...byId.values()];
      const [used, dismissedRemote, dismissedLocal, notifiedRemote, notifiedLocal, lastStart] =
        await Promise.all([
          fetchUsedProviderWorkoutIds(user.id),
          fetchDismissedProviderWorkoutIds(user.id),
          readDismissedWorkoutIds(),
          fetchBeginNotifiedProviderWorkoutIds(user.id).catch(() => new Set<string>()),
          readBeginNotifiedWorkoutIds(),
          fetchLatestWorkoutStart(user.id, challenge.id),
        ]);
      const skip = new Set([...used, ...dismissedRemote, ...dismissedLocal]);
      const ranked = rankHealthWorkouts(ranged, {
        period,
        minMinutes: challenge.min_minutes,
        usedIds: skip,
        preferStartedAfter: lastStart,
      }).filter((row) => meetsMinMinutes(row.durationSec, challenge.min_minutes));
      const next = ranked[0] ?? null;
      setWorkout(next);
      if (!next) {
        return;
      }
      const alreadyNotified =
        notifiedRemote.has(next.providerWorkoutId) || notifiedLocal.includes(next.providerWorkoutId);
      if (alreadyNotified) {
        return;
      }
      await rememberBeginNotifiedWorkoutId(next.providerWorkoutId);
      try {
        await markHealthWorkoutBeginNotified(user.id, next);
      } catch {
        // Local one-shot still stands.
      }
      await notifyForgotToBegin({
        challengeId: challenge.id,
        duration: formatHealthDuration(next.durationSec),
        activity: next.activityLabel,
      });
    } catch {
      // Foreground prompt is optional. Camera check-in still works.
    }
  }, [available, challenge, phase, user]);

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

  return {
    workout,
    challenge,
    phase,
    dismiss,
  };
}
