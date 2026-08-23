import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

const ASKED_KEY = 'blob.pushPermissionAsked';
const ANDROID_CHANNEL = 'alerts';

export const PUSH_PROMPT_TYPES = new Set([
  'friend_request',
  'friend_accepted',
  'friend_challenge',
  'challenge_invite',
  'challenge_join_confirmed',
  'challenge_joined',
  'tagged',
  'mentioned',
  'post_comment',
  'post_reaction',
]);

export type PushPermissionState = 'undetermined' | 'granted' | 'denied' | 'unavailable';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldPlaySound: false,
      shouldSetBadge: true,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

export async function getPushPermissionState(): Promise<PushPermissionState> {
  if (Platform.OS === 'web') {
    return 'unavailable';
  }
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) {
      return 'granted';
    }
    if (current.status === 'denied' || current.canAskAgain === false) {
      return 'denied';
    }
    return 'undetermined';
  } catch {
    return 'unavailable';
  }
}

export async function openNotificationSettings(): Promise<void> {
  if (Platform.OS === 'web') {
    return;
  }
  await Linking.openSettings();
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL, {
    name: 'Alerts',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 180, 120, 180],
    lightColor: '#2C9B89',
  });
}

function expoProjectId(): string | undefined {
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  return extra?.eas?.projectId ?? Constants.easConfig?.projectId ?? undefined;
}

export async function registerPushToken(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return null;
  }
  const state = await getPushPermissionState();
  if (state !== 'granted') {
    return null;
  }
  await ensureAndroidChannel();
  try {
    const projectId = expoProjectId();
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    const value = token.data?.trim();
    if (!value) {
      return null;
    }
    const { error } = await supabase.rpc('register_push_token', {
      p_token: value,
      p_platform: Platform.OS,
    });
    if (error) {
      console.log('[blob:push] register skipped', error.message);
    }
    return value;
  } catch (error) {
    console.log('[blob:push] token skipped', error);
    return null;
  }
}

async function alreadyAsked(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(ASKED_KEY)) === '1';
  } catch {
    return false;
  }
}

async function markAsked(): Promise<void> {
  try {
    await SecureStore.setItemAsync(ASKED_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** Prompt once, on the first notifiable action. Never on launch. No nag if denied. */
export async function maybeRequestPushPermission(): Promise<PushPermissionState> {
  if (Platform.OS === 'web') {
    return 'unavailable';
  }
  const current = await getPushPermissionState();
  if (current === 'granted') {
    void registerPushToken();
    return 'granted';
  }
  if (current === 'denied' || current === 'unavailable') {
    await markAsked();
    return current;
  }
  if (await alreadyAsked()) {
    return 'undetermined';
  }
  await markAsked();
  await ensureAndroidChannel();
  try {
    const next = await Notifications.requestPermissionsAsync();
    if (next.granted) {
      void registerPushToken();
      return 'granted';
    }
    return next.canAskAgain === false ? 'denied' : 'undetermined';
  } catch {
    return 'unavailable';
  }
}

export async function syncDeviceTimezone(current?: string | null): Promise<void> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  if (current && current === timezone) {
    return;
  }
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) {
    return;
  }
  const { error } = await supabase.from('profiles').update({ timezone }).eq('id', userId);
  if (error) {
    console.log('[blob:push] timezone skipped', error.message);
  }
}

export type NotificationNavData = {
  type?: string;
  challenge_id?: string;
  post_id?: string;
  story_id?: string;
  username?: string;
  href?: string;
  callout_id?: string;
  notification_id?: string;
  actor_id?: string;
};

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

export function notificationDataFromResponse(
  data: Record<string, unknown> | undefined | null,
): NotificationNavData {
  if (!data) {
    return {};
  }
  return {
    type: asString(data.type),
    challenge_id: asString(data.challenge_id) ?? asString(data.challengeId),
    post_id: asString(data.post_id) ?? asString(data.postId),
    story_id: asString(data.story_id) ?? asString(data.storyId),
    username: asString(data.username),
    href: asString(data.href),
    callout_id: asString(data.callout_id) ?? asString(data.calloutId),
    notification_id: asString(data.notification_id) ?? asString(data.notificationId),
    actor_id: asString(data.actor_id) ?? asString(data.actorId),
  };
}
