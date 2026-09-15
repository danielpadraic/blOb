import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { useLoggableChallenges, type LoggableChallenge } from '@/hooks/useLoggableChallenge';
import { isFitnessShapedChallenge } from '@/lib/health/fitnessShaped';
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
import { workoutPromptTargets, type PromptCandidate } from '@/lib/health/workoutPromptTargets';
import type { GateWorkout } from '@/lib/health/workoutProofGate';
import { getHealthProvider, type HealthWorkout } from '@/services/health';
import {
  readBeginNotifiedWorkoutIds,
  readDismissedWorkoutIds,
  rememberBeginNotifiedWorkoutId,
  rememberDismissedWorkoutId,
} from '@/services/health/local';

/** A fitness challenge the found workout would actually count for. */
export type PromptTarget = { id: string; title: string };

function acceptsWorkout(challenge: LoggableChallenge): boolean {
  return isFitnessShapedChallenge({
    proofs: challenge.proofs,
    proof_type: challenge.proof_type,
    task: challenge.task,
    tasks: challenge.tasks,
    title: challenge.title,
  });
}

function toGateWorkout(workout: HealthWorkout): GateWorkout {
  return {
    id: workout.providerWorkoutId,
    source: workout.source === 'health_connect' ? 'health_connect' : 'healthkit',
    startedAt: workout.startedAt,
    endedAt: workout.endedAt,
    durationSec: workout.durationSec,
    avgHrBpm: workout.hrAvg ?? null,
  };
}

function asPromptCandidate(row: LoggableChallenge): PromptCandidate {
  return {
    challenge: row,
    checkin: {
      status: row.checkinPhase === 'submitted' ? 'submitted' : row.checkinPhase,
      submitted_at: row.submittedThisPeriod ? '1' : null,
      proof_parts: row.proofParts ?? null,
    },
  };
}

function windowFor(challenge: LoggableChallenge): { from: Date; to: Date } {
  return challengeHealthWindow({
    frequency: challenge.frequency,
    starts_at: challenge.starts_at,
    is_official: challenge.is_official,
    series_id: challenge.series_id,
    status: challenge.status,
    timezone: challenge.timezone,
    days_required: challenge.days_required,
    day_windows: challenge.day_windows,
  });
}

export function useHealthLogPrompt() {
  const { user } = useAuth();
  const loggable = useLoggableChallenges();
  const [workout, setWorkout] = useState<HealthWorkout | null>(null);
  const [targets, setTargets] = useState<PromptTarget[]>([]);

  const available = Boolean(getHealthProvider()?.isAvailable());

  /**
   * Fitness-shaped only — Prayer stays off the banner. A selfie already on today's 30-Day
   * check-in must not drop the row; workoutPromptTargets decides whether the HR slot is still open.
   */
  const candidates = useMemo(
    () => (loggable.data ?? []).filter((row) => acceptsWorkout(row)),
    [loggable.data],
  );

  const scan = useCallback(async () => {
    if (!user || !available || candidates.length === 0) {
      setWorkout(null);
      setTargets([]);
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
      // Each challenge has its own period window, so fetch across the union once and let every
      // candidate judge the same rows against its own window and minimum.
      const windows = candidates.map((row) => ({ challenge: row, period: windowFor(row) }));
      const open = windows.filter(({ period }) => period.to.getTime() > period.from.getTime());
      if (open.length === 0) {
        setWorkout(null);
        setTargets([]);
        return;
      }
      const union = {
        from: new Date(Math.min(...open.map(({ period }) => period.from.getTime()))),
        to: new Date(Math.max(...open.map(({ period }) => period.to.getTime()))),
      };
      const synced = await syncNewHealthWorkouts(user.id);
      const periodRows = (await provider.fetchWorkouts(union)) ?? [];
      const byId = new Map<string, HealthWorkout>();
      for (const row of [...synced, ...periodRows]) {
        byId.set(row.providerWorkoutId, row);
      }
      const ranged = [...byId.values()];
      const [used, dismissedRemote, dismissedLocal, notifiedRemote, notifiedLocal] = await Promise.all([
        fetchUsedProviderWorkoutIds(user.id),
        fetchDismissedProviderWorkoutIds(user.id),
        readDismissedWorkoutIds(),
        fetchBeginNotifiedProviderWorkoutIds(user.id).catch(() => new Set<string>()),
        readBeginNotifiedWorkoutIds(),
      ]);
      const skip = new Set([...used, ...dismissedRemote, ...dismissedLocal]);
      const lastStarts = await Promise.all(
        open.map(({ challenge }) =>
          fetchLatestWorkoutStart(user.id, challenge.id).catch(() => null),
        ),
      );

      // One row per challenge that actually has a workout it would accept.
      const matches = open
        .map(({ challenge, period }, index) => {
          const ranked = rankHealthWorkouts(ranged, {
            period,
            minMinutes: challenge.min_minutes,
            usedIds: skip,
            preferStartedAfter: lastStarts[index],
          }).filter((row) => meetsMinMinutes(row.durationSec, challenge.min_minutes));
          return { challenge, workout: ranked[0] ?? null };
        })
        .filter((row): row is { challenge: LoggableChallenge; workout: HealthWorkout } =>
          Boolean(row.workout),
        );

      if (matches.length === 0) {
        setWorkout(null);
        setTargets([]);
        return;
      }

      // The prompt speaks about one workout. Offer the best one, then name every fitness challenge
      // that would take it — never a challenge that would not.
      const next = matches[0].workout;
      const offered = matches.filter((row) => row.workout.providerWorkoutId === next.providerWorkoutId);
      const targets = workoutPromptTargets({
        workouts: [toGateWorkout(next)],
        candidates: offered.map((row) => asPromptCandidate(row.challenge)),
      });
      if (targets.length === 0) {
        setWorkout(null);
        setTargets([]);
        return;
      }
      setWorkout(next);
      setTargets(targets.map((row) => ({ id: row.challengeId, title: row.title })));

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
        challengeId: targets[0].challengeId,
        duration: formatHealthDuration(next.durationSec),
        activity: next.activityLabel,
      });
    } catch {
      // Foreground prompt is optional. Camera check-in still works.
    }
  }, [available, candidates, user]);

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
    setTargets([]);
  }, [user, workout]);

  return {
    workout,
    /** Every fitness challenge this workout counts for. Empty means show nothing. */
    targets,
    dismiss,
  };
}
