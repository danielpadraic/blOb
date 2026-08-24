import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { useAuth } from '@/hooks/useAuth';
import { challengeAcceptsWorkoutProof } from '@/lib/health/acceptsWorkout';
import { insertHealthWorkoutStart } from '@/lib/health/remote';
import { getHealthProvider } from '@/services/health';
import { startChallengeOnWatch, watchStartAvailable } from '@/services/health/watchStart';
import { challengeToWorkoutPlan } from '@/services/health/workoutPlan';
import type { Challenge } from '@/lib/types';

type Startable = {
  id: string;
  title?: string | null;
  task?: string | null;
  description?: string | null;
  rules?: string | null;
  min_minutes?: number | null;
  frequency?: string | null;
  proofs?: Challenge['proofs'];
  proof_type?: Challenge['proof_type'];
  proof_requirements?: Challenge['proof_requirements'];
  challenge_type?: Challenge['challenge_type'];
  tasks?: Challenge['tasks'];
  scoring_method?: Challenge['scoring_method'];
  scoring_config?: Challenge['scoring_config'];
  comparable_points_config?: Challenge['comparable_points_config'];
  privacy_mode?: Challenge['privacy_mode'];
  is_official?: Challenge['is_official'];
  series_id?: Challenge['series_id'];
  category?: Challenge['category'];
};

export function useStartOnWatch(challenge?: Startable | null) {
  const { user } = useAuth();
  const [available, setAvailable] = useState(false);
  const [busy, setBusy] = useState(false);

  const workoutProof = challengeAcceptsWorkoutProof(challenge ?? null);
  const visible = Platform.OS === 'ios' && available && workoutProof;

  useEffect(() => {
    if (Platform.OS !== 'ios' || !workoutProof) {
      setAvailable(false);
      return;
    }
    let cancelled = false;
    void watchStartAvailable().then((ok) => {
      if (!cancelled) {
        setAvailable(ok);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [workoutProof]);

  const start = useCallback(async (): Promise<'ok' | 'cancelled' | 'failed' | 'denied'> => {
    if (!challenge?.id || !visible || busy) {
      return 'failed';
    }
    setBusy(true);
    try {
      const provider = getHealthProvider();
      const access = await provider?.requestWorkoutWrite?.();
      if (access === 'denied' || access === 'unavailable') {
        return access === 'denied' ? 'denied' : 'failed';
      }
      const plan = challengeToWorkoutPlan(challenge);
      const result = await startChallengeOnWatch(plan);
      if (result === 'started' || result === 'previewed') {
        if (user?.id) {
          try {
            await insertHealthWorkoutStart({
              userId: user.id,
              challengeId: challenge.id,
              activityType: plan.activityType,
              goalSeconds: plan.goal.type === 'time' ? plan.goal.seconds : null,
            });
          } catch {
            // Start still happened. Matching can fall back to period.
          }
        }
        return 'ok';
      }
      if (result === 'cancelled') {
        return 'cancelled';
      }
      return 'failed';
    } finally {
      setBusy(false);
    }
  }, [busy, challenge, user?.id, visible]);

  return { visible, busy, start };
}
