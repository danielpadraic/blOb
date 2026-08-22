import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { markNotificationRead, notificationHref } from '@/lib/notifications';
import {
  getPushPermissionState,
  maybeRequestPushPermission,
  notificationDataFromResponse,
  registerPushToken,
  syncDeviceTimezone,
  type NotificationNavData,
} from '@/lib/push';
import { BODY_METRICS_HREF, challengeDetailHref, storyHref } from '@/lib/routes';
import type { AppNotification } from '@/lib/types';

function hrefFromPushData(data: NotificationNavData): Href | null {
  if (data.href) {
    return data.href as Href;
  }
  const fake: AppNotification = {
    id: '',
    user_id: '',
    actor_id: null,
    type: data.type ?? '',
    title: '',
    body: null,
    data: {
      challenge_id: data.challenge_id,
      post_id: data.post_id,
      story_id: data.story_id,
      username: data.username,
      callout_id: data.callout_id,
      actor_id: data.actor_id,
      notification_id: data.notification_id,
    },
    read_at: null,
    created_at: '',
  };
  return notificationHref(fake);
}

/** Registers an existing grant and opens tapped alerts. Does not prompt. */
export function usePushNotifications() {
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const router = useRouter();
  const userId = user?.id;

  useEffect(() => {
    if (!userId || Platform.OS === 'web') {
      return;
    }
    void syncDeviceTimezone(profile?.timezone);
    void maybeRequestPushPermission();
  }, [profile?.timezone, userId]);

  useEffect(() => {
    if (!userId || Platform.OS === 'web') {
      return;
    }
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        return;
      }
      void syncDeviceTimezone(profile?.timezone);
      void (async () => {
        if ((await getPushPermissionState()) === 'granted') {
          await registerPushToken();
        }
      })();
    });
    return () => sub.remove();
  }, [profile?.timezone, userId]);

  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS === 'web') {
      return;
    }

    function open(data: NotificationNavData) {
      if (data.notification_id) {
        void markNotificationRead(data.notification_id);
      }
      const href = hrefFromPushData(data);
      if (href) {
        router.push(href);
        return;
      }
      if (data.story_id) {
        router.push(storyHref(data.story_id));
        return;
      }
      if (data.challenge_id) {
        router.push(challengeDetailHref(data.challenge_id, 'lobby'));
        return;
      }
      if (data.type === 'profile_incomplete') {
        router.push(BODY_METRICS_HREF);
      }
    }

    const received = Notifications.addNotificationResponseReceivedListener((response) => {
      const key = response.notification.request.identifier;
      if (handled.current === key) {
        return;
      }
      handled.current = key;
      open(notificationDataFromResponse(response.notification.request.content.data));
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) {
        return;
      }
      const key = response.notification.request.identifier;
      if (handled.current === key) {
        return;
      }
      handled.current = key;
      open(notificationDataFromResponse(response.notification.request.content.data));
    });

    return () => {
      received.remove();
    };
  }, [router]);
}
