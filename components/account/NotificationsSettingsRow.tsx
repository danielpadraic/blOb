import { useEffect, useState } from 'react';
import { AppState, Platform, Pressable, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import {
  getPushPermissionState,
  openNotificationSettings,
  requestPushFromSettings,
  type PushPermissionState,
} from '@/lib/push';
import { THEME } from '@/lib/theme';

/**
 * Recovery path for push. iOS only prompts once; this row is how an existing account turns
 * alerts on or opens Settings. Web never pretends to flip an OS switch.
 */
export function NotificationsSettingsRow() {
  const [state, setState] = useState<PushPermissionState>('undetermined');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getPushPermissionState().then(setState);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void getPushPermissionState().then(setState);
      }
    });
    return () => sub.remove();
  }, []);

  async function turnOn() {
    if (busy) {
      return;
    }
    setBusy(true);
    try {
      const next = await requestPushFromSettings();
      setState(next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View className="gap-2">
      <AppText className="text-sm font-semibold text-charcoal">{copy('account.notificationsTitle')}</AppText>
      <AppText className="text-[12px] leading-5 text-muted">{copy('account.notificationsHelper')}</AppText>
      {state === 'unavailable' || Platform.OS === 'web' ? (
        <AppText className="text-sm leading-5 text-muted">{copy('account.notificationsWeb')}</AppText>
      ) : state === 'granted' ? (
        <View className="gap-1">
          <AppText className="text-sm font-semibold text-charcoal">{copy('account.notificationsOn')}</AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() => void openNotificationSettings()}
            hitSlop={8}
            style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText className="text-[12px] font-semibold" style={{ color: THEME.accent }}>
              {Platform.OS === 'ios'
                ? copy('account.notificationsChangeIos')
                : copy('account.notificationsChangeAndroid')}
            </AppText>
          </Pressable>
        </View>
      ) : state === 'denied' ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => void openNotificationSettings()}
          hitSlop={8}
          style={{ minHeight: 44, justifyContent: 'center' }}>
          <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
            {copy('account.notificationsOffOpen')}
          </AppText>
        </Pressable>
      ) : (
        <Button
          title={copy('account.notificationsTurnOn')}
          onPress={() => void turnOn()}
          loading={busy}
        />
      )}
    </View>
  );
}
