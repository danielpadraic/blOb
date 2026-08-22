import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { copy } from '@/lib/copy';
import { fetchLatestWorkoutStart } from '@/lib/health/remote';
import { rankHealthWorkouts } from '@/lib/health/match';
import { challengeHealthWindow } from '@/lib/health/period';
import { maybeRequestPushPermission } from '@/lib/push';
import { getHealthProvider } from '@/services/health';

const CHECKOUT_PREFIX = 'blob.health.checkout.';
const memory = new Map<string, string>();

async function readKey(key: string): Promise<string | null> {
  try {
    if (Platform.OS === 'web') {
      return memory.get(key) ?? null;
    }
    return (await SecureStore.getItemAsync(key)) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

async function writeKey(key: string, value: string): Promise<void> {
  memory.set(key, value);
  if (Platform.OS === 'web') {
    return;
  }
  try {
    await SecureStore.setItemAsync(key, value);
  } catch {
    // In-memory is enough for this session.
  }
}

async function removeKey(key: string): Promise<void> {
  memory.delete(key);
  if (Platform.OS === 'web') {
    return;
  }
  try {
    await SecureStore.deleteItemAsync(key);
  } catch {
    // Best-effort.
  }
}

async function canNotify(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return false;
  }
  const state = await maybeRequestPushPermission();
  return state === 'granted';
}

export async function notifyForgotToBegin(input: {
  challengeId: string;
  duration: string;
  activity: string;
}): Promise<void> {
  if (!(await canNotify())) {
    return;
  }
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: 'blOb',
        body: copy('health.prompt', 'neutral', {
          duration: input.duration,
          activity: input.activity,
        }),
        data: {
          type: 'health_begin',
          challenge_id: input.challengeId,
          href: `/challenges/${input.challengeId}/submit`,
        },
      },
      trigger: null,
    });
  } catch {
    // Banner still shows.
  }
}

export async function scheduleCheckoutReminder(input: {
  checkinId: string;
  challengeId: string;
  userId: string;
  beganAt: string;
  minMinutes?: number | null;
  frequency?: string | null;
  startsAt?: string | null;
  isOfficial?: boolean | null;
  seriesId?: string | null;
  timezone?: string | null;
  daysRequired?: number | null;
  dayWindows?: unknown;
}): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  const key = `${CHECKOUT_PREFIX}${input.checkinId}`;
  if (await readKey(key)) {
    return;
  }
  if (!(await canNotify())) {
    return;
  }
  const min = Math.max(Number(input.minMinutes) || 0, 0);
  const beganMs = new Date(input.beganAt).getTime();
  if (!Number.isFinite(beganMs)) {
    return;
  }
  let watchEndMs = Number.NaN;
  try {
    const lastStart = await fetchLatestWorkoutStart(input.userId, input.challengeId);
    if (lastStart) {
      const provider = getHealthProvider();
      const period = challengeHealthWindow({
        frequency: input.frequency,
        starts_at: input.startsAt,
        is_official: input.isOfficial,
        series_id: input.seriesId,
        timezone: input.timezone,
        days_required: input.daysRequired,
        day_windows: input.dayWindows,
      });
      const rows = (await provider?.fetchWorkouts(period)) ?? [];
      const ranked = rankHealthWorkouts(rows, {
        period,
        minMinutes: input.minMinutes,
        preferStartedAfter: lastStart,
      });
      const ended = ranked[0]?.endedAt ? new Date(ranked[0].endedAt).getTime() : Number.NaN;
      if (Number.isFinite(ended)) {
        watchEndMs = ended;
      }
    }
  } catch {
    // Begin + required minutes is enough.
  }
  const requiredAt = beganMs + min * 60_000;
  const fireMs = Math.max(requiredAt, Number.isFinite(watchEndMs) ? watchEndMs : requiredAt);
  const when = new Date(Math.max(fireMs, Date.now() + 2_000));
  try {
    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'blOb',
        body: copy('health.checkoutPush'),
        data: {
          type: 'health_checkout',
          challenge_id: input.challengeId,
          href: `/challenges/${input.challengeId}/submit`,
        },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when },
    });
    await writeKey(key, id);
  } catch {
    // Camera check-in still works.
  }
}

export async function cancelCheckoutReminder(checkinId: string): Promise<void> {
  if (!checkinId || Platform.OS === 'web') {
    return;
  }
  const key = `${CHECKOUT_PREFIX}${checkinId}`;
  const id = await readKey(key);
  if (id) {
    try {
      await Notifications.cancelScheduledNotificationAsync(id);
    } catch {
      // Already fired or missing.
    }
  }
  await removeKey(key);
}

