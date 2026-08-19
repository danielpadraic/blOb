import { Platform } from 'react-native';

import { loadWatchStartNative } from '@/modules/blob-workout-start';
import type { ChallengeWorkoutPlan } from '@/services/health/workoutPlan';

export type WatchStartResult = 'started' | 'previewed' | 'cancelled' | 'unavailable' | 'failed';

export async function watchStartAvailable(): Promise<boolean> {
  if (Platform.OS !== 'ios') {
    return false;
  }
  const native = loadWatchStartNative();
  if (!native) {
    return false;
  }
  try {
    const detail = await native.getAvailability();
    return Boolean(detail.available);
  } catch {
    return false;
  }
}

export async function startChallengeOnWatch(plan: ChallengeWorkoutPlan): Promise<WatchStartResult> {
  if (Platform.OS !== 'ios') {
    return 'unavailable';
  }
  const native = loadWatchStartNative();
  if (!native) {
    return 'unavailable';
  }
  try {
    const detail = await native.getAvailability();
    if (!detail.available) {
      return 'unavailable';
    }
  } catch {
    return 'unavailable';
  }

  const goalSeconds = plan.goal.type === 'time' ? plan.goal.seconds : null;
  try {
    await native.startWatchApp(plan.activityType, plan.locationType);
    return 'started';
  } catch (error) {
    if (isCancelled(error)) {
      return 'cancelled';
    }
  }
  try {
    await native.previewWorkoutPlan(
      plan.activityType,
      plan.locationType,
      plan.displayName,
      goalSeconds,
    );
    return 'previewed';
  } catch (error) {
    if (isCancelled(error)) {
      return 'cancelled';
    }
    return 'failed';
  }
}

function isCancelled(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const lower = message.toLowerCase();
  return lower.includes('cancel') || lower.includes('usercanceled') || lower.includes('user_canceled');
}
