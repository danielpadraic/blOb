import {
  fetchHealthConnection,
  upsertHealthConnection,
  upsertHealthWorkout,
} from '@/lib/health/remote';
import { copy } from '@/lib/copy';
import { getHealthProvider } from '@/services/health';
import { writeLocalHealthStatus } from '@/services/health/local';
import type { HealthWorkout } from '@/services/health/types';

export async function syncNewHealthWorkouts(userId: string): Promise<HealthWorkout[]> {
  const provider = getHealthProvider();
  if (!provider?.syncNewWorkouts) {
    return [];
  }
  const native = await provider.getAuthStatus();
  if (native === 'denied') {
    await writeLocalHealthStatus('denied');
    await upsertHealthConnection({
      userId,
      status: 'disconnected',
      lastError: null,
    });
    return [];
  }
  const remote = await fetchHealthConnection(userId);
  if (remote && remote.status !== 'connected' && native !== 'connected') {
    return [];
  }
  try {
    await provider.enableBackgroundSync?.();
    const result = await provider.syncNewWorkouts(remote?.hk_workout_anchor ?? null);
    await Promise.all(result.workouts.map((workout) => upsertHealthWorkout(userId, workout)));
    // Deleted HealthKit samples are ignored. Existing proofs stay.
    await upsertHealthConnection({
      userId,
      status: 'connected',
      lastSyncedAt: new Date().toISOString(),
      hkWorkoutAnchor: result.nextAnchor,
      lastError: null,
    });
    return result.workouts;
  } catch {
    await upsertHealthConnection({
      userId,
      status: remote?.status === 'connected' || native === 'connected' ? 'connected' : 'disconnected',
      lastError: copy('health.syncFailed'),
    });
    return [];
  }
}
