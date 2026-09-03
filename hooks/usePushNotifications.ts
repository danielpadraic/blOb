import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';

import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { pushChallengeHref, pushNotificationHref } from '@/lib/challengeNav';
import { markNotificationRead, notificationHrefFromPushData } from '@/lib/notifications';
import {
  getPushPermissionState,
  notificationDataFromResponse,
  registerPushToken,
  syncDeviceTimezone,
  type NotificationNavData,
} from '@/lib/push';
import { BODY_METRICS_HREF, INTERESTS_HREF, challengeDetailHref, storyHref } from '@/lib/routes';

/** Registers an existing grant and opens tapped alerts. Does not prompt. */
export function usePushNotifications() {
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const router = useRouter();
  const pathname = usePathname();
  const userId = user?.id;

  useEffect(() => {
    if (!userId || Platform.OS === 'web') {
      return;
    }
    void syncDeviceTimezone(profile?.timezone);
    void (async () => {
      if ((await getPushPermissionState()) === 'granted') {
        await registerPushToken();
      }
    })();
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
      const href = notificationHrefFromPushData(data);
      if (href) {
        pushNotificationHref(router, href, 'push-tap', pathname);
        return;
      }
      if (data.story_id) {
        router.push(storyHref(data.story_id));
        return;
      }
      if (data.challenge_id) {
        pushChallengeHref(
          router,
          String(challengeDetailHref(data.challenge_id, 'lobby')),
          'push-tap',
          data.challenge_id,
          pathname,
        );
        return;
      }
      if (data.type === 'interests_reminder') {
        router.push(INTERESTS_HREF);
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
  }, [pathname, router]);
}
