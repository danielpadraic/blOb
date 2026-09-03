import { useEffect, useRef, useState } from 'react';
import { Alert, AppState, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import type { Href } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { useAuth } from '@/hooks/useAuth';
import { useHealthConnection } from '@/hooks/useHealthConnection';
import { useMyProfile, useUpdateProfile, useUsernameAvailability } from '@/hooks/useProfile';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { copy } from '@/lib/copy';
import { replayTutorial, setCreateTourOptOut } from '@/lib/legal';
import { TAB_BAR_PEEK, THEME } from '@/lib/theme';
import { useTour } from '@/components/tour/TourContext';
import { reportAppError } from '@/lib/appErrors';
import { getErrorMessage, getPasswordUpdateMessage } from '@/utils/errors';
import {
  getPushPermissionState,
  openNotificationSettings,
  type PushPermissionState,
} from '@/lib/push';

const PASSWORD_TIMEOUT_MS = 20000;

export default function AccountScreen() {
  const router = useRouter();
  const tour = useTour();
  const { user, updateEmail, updatePassword } = useAuth();
  const { profile, refetch } = useMyProfile();
  const updateProfile = useUpdateProfile();
  const scrollRef = useRef<ScrollView>(null);

  const [username, setUsername] = useState(profile?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<'username' | 'email' | 'password' | null>(null);
  const [pushState, setPushState] = useState<PushPermissionState>('undetermined');
  const [healthSheet, setHealthSheet] = useState(false);
  const health = useHealthConnection();

  useEffect(() => {
    void getPushPermissionState().then(setPushState);
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') {
        void getPushPermissionState().then(setPushState);
        void health.refetch();
      }
    });
    return () => sub.remove();
  }, [health.refetch]);

  const availability = useUsernameAvailability(username, profile?.username);

  async function saveUsername() {
    const next = username.trim().toLowerCase();
    if (next === profile?.username) {
      return;
    }
    if (availability.isTaken || availability.isChecking) {
      Alert.alert('Username', 'That username is taken.');
      return;
    }
    setBusy('username');
    try {
      await updateProfile.mutateAsync({ username: next });
      Alert.alert('Saved', 'Username updated.');
    } catch (error) {
      Alert.alert('Couldn’t update username', getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function saveEmail() {
    const next = email.trim();
    if (!next || next === user?.email) {
      return;
    }
    setBusy('email');
    try {
      await updateEmail(next);
      Alert.alert('Check your inbox', 'Confirm the new email if prompted.');
    } catch (error) {
      Alert.alert('Couldn’t update email', getErrorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  async function savePassword() {
    if (busy != null) {
      return;
    }
    setNotice(null);
    setPasswordError(null);
    setConfirmError(null);
    if (password.length < 8) {
      setPasswordError(copy('error.passwordMin'));
      return;
    }
    if (password !== confirm) {
      setConfirmError(copy('error.passwordMismatch'));
      return;
    }
    setBusy('password');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        updatePassword(password),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('timeout')), PASSWORD_TIMEOUT_MS);
        }),
      ]);
      setPassword('');
      setConfirm('');
      setNotice(copy('account.passwordUpdated'));
      scrollRef.current?.scrollTo({ y: 0 });
    } catch (error) {
      reportAppError({ route: 'profile/account-password', error });
      setPasswordError(getPasswordUpdateMessage(error));
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
      setBusy(null);
    }
  }

  const usernameHint = availability.isChecking
    ? 'Checking…'
    : availability.isTaken
      ? 'That username is taken'
      : availability.isAvailable
        ? 'Available'
        : 'lowercase, unique, 3–24 characters';

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES}>
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="grow px-4"
        contentContainerStyle={{ paddingBottom: 24 + TAB_BAR_PEEK }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
      <AppText className="mb-4 text-[22px] font-extrabold text-charcoal">Account</AppText>
      {notice ? (
        <AppText className="mb-4 text-sm font-semibold" style={{ color: THEME.accent }}>
          {notice}
        </AppText>
      ) : null}
      <View className="gap-5">
        {health.showRow ? (
        <View className="gap-2">
          <AppText className="text-sm font-semibold text-charcoal">{health.title}</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={health.title}
            disabled={health.connecting || health.disconnecting}
            onPress={() => {
              if (health.status === 'connected') {
                setHealthSheet(true);
                return;
              }
              void health.connect().then((row) => {
                if (row.status === 'not_connected') {
                  Alert.alert(health.title, copy('health.permissionDenied'));
                  return;
                }
                if (row.status === 'unavailable') {
                  Alert.alert(health.title, copy('health.unavailable'));
                  return;
                }
                if (row.status === 'needs_install') {
                  Alert.alert(health.title, copy('health.installSubtitle'));
                }
              });
            }}
            style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText className="text-sm leading-5 text-muted">{health.subtitle}</AppText>
            {health.lastSyncedLabel ? (
              <AppText className="mt-0.5 text-[12px] leading-5 text-muted">{health.lastSyncedLabel}</AppText>
            ) : null}
          </Pressable>
          {health.helper ? (
            <AppText className="text-[12px] leading-5 text-muted">{health.helper}</AppText>
          ) : null}
          {health.lastError ? (
            <AppText className="text-[12px] leading-5 text-muted">{health.lastError}</AppText>
          ) : null}
        </View>
        ) : null}
        <View className="gap-2">
          <AppText className="text-sm font-semibold text-charcoal">Legal</AppText>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/profile/legal/terms' as Href)}
            hitSlop={8}
            style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
              Terms of Service and User Agreement
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            onPress={() => router.push('/profile/legal/privacy' as Href)}
            hitSlop={8}
            style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
              Privacy Policy
            </AppText>
          </Pressable>
        </View>
        <View className="gap-2">
          <AppText className="text-sm font-semibold text-charcoal">Tour</AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              void replayTutorial()
                .then(() => refetch())
                .then(() => {
                  router.replace('/feed');
                  setTimeout(() => tour.start(), 400);
                })
                .catch((error) => Alert.alert('Tour', getErrorMessage(error)));
            }}
            hitSlop={8}
            style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
              Replay first-run tour
            </AppText>
          </Pressable>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: !profile?.create_tour_opt_out_at }}
            onPress={() => {
              const nextOn = Boolean(profile?.create_tour_opt_out_at);
              void setCreateTourOptOut(!nextOn)
                .then(() => refetch())
                .catch((error) => Alert.alert('Tour', getErrorMessage(error)));
            }}
            hitSlop={8}
            style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
              Challenge create tour · {profile?.create_tour_opt_out_at ? 'Off' : 'On'}
            </AppText>
          </Pressable>
        </View>
        <View className="gap-2">
          <AppText className="text-sm font-semibold text-charcoal">Notifications</AppText>
          <AppText className="text-sm leading-5 text-muted">
            {pushState === 'granted'
              ? 'Push is on.'
              : pushState === 'denied'
                ? 'Push is off. In-app alerts still work.'
                : 'Push stays off until a friend request, invite, or Challenge.'}
          </AppText>
          {pushState !== 'granted' && pushState !== 'unavailable' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void openNotificationSettings()}
              hitSlop={8}
              style={{ minHeight: 44, justifyContent: 'center' }}>
              <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
                Open system settings
              </AppText>
            </Pressable>
          ) : null}
        </View>
        <View className="gap-3">
          <Input
            label="Username"
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
            hint={usernameHint}
          />
          <Button
            title="Save username"
            onPress={() => void saveUsername()}
            loading={busy === 'username'}
            disabled={busy != null || availability.isTaken || availability.isChecking}
          />
        </View>
        <View className="gap-3">
          <Input
            label="Email"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <Button
            title="Save email"
            onPress={() => void saveEmail()}
            loading={busy === 'email'}
            disabled={busy != null}
          />
        </View>
        <View className="gap-3">
          <Input
            label="New password"
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            value={password}
            onChangeText={(value) => {
              setPassword(value);
              setPasswordError(null);
            }}
            error={passwordError ?? undefined}
            hint={passwordError ? undefined : copy('account.passwordHint')}
          />
          <Input
            label="Confirm password"
            secureTextEntry
            autoComplete="new-password"
            textContentType="newPassword"
            value={confirm}
            onChangeText={(value) => {
              setConfirm(value);
              setConfirmError(null);
            }}
            error={confirmError ?? undefined}
          />
          <Button
            title="Save password"
            onPress={() => void savePassword()}
            loading={busy === 'password'}
            disabled={busy != null}
          />
        </View>
      </View>
      </ScrollView>
      <ChromeOverlay visible={healthSheet} onClose={() => setHealthSheet(false)} align="end">
        <View
          className="px-5 pt-4"
          style={{
            backgroundColor: THEME.surface,
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            paddingBottom: 20,
          }}>
          <View className="mb-3 items-center">
            <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
          </View>
          <AppText className="text-center text-sm leading-5 text-muted">{copy('health.disconnect')}</AppText>
          <View className="mt-5 gap-3">
            <Button
              title={copy('health.disconnectAction')}
              size="lg"
              loading={health.disconnecting}
              onPress={() => {
                void health.disconnect().then(() => setHealthSheet(false));
              }}
            />
            <Button title="Cancel" size="lg" variant="ghost" onPress={() => setHealthSheet(false)} />
          </View>
        </View>
      </ChromeOverlay>
    </Screen>
  );
}
