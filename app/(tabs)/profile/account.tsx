import { useState } from 'react';
import { Alert, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile, useUpdateProfile, useUsernameAvailability } from '@/hooks/useProfile';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { getErrorMessage } from '@/utils/errors';

export default function AccountScreen() {
  const { user, updateEmail, updatePassword } = useAuth();
  const { profile } = useMyProfile();
  const updateProfile = useUpdateProfile();

  const [username, setUsername] = useState(profile?.username ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState<'username' | 'email' | 'password' | null>(null);

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
    if (password.length < 8) {
      Alert.alert('Password', 'Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      Alert.alert('Password', 'Those passwords don’t match.');
      return;
    }
    setBusy('password');
    try {
      await updatePassword(password);
      setPassword('');
      setConfirm('');
      Alert.alert('Saved', 'Password updated.');
    } catch (error) {
      Alert.alert('Couldn’t update password', getErrorMessage(error));
    } finally {
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
    <Screen scroll edges={TAB_ROOT_EDGES}>
      <AppText className="mb-4 text-[22px] font-extrabold text-charcoal">Account</AppText>
      <View className="gap-5">
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
            value={password}
            onChangeText={setPassword}
          />
          <Input
            label="Confirm password"
            secureTextEntry
            value={confirm}
            onChangeText={setConfirm}
          />
          <Button
            title="Save password"
            onPress={() => void savePassword()}
            loading={busy === 'password'}
            disabled={busy != null}
          />
        </View>
      </View>
    </Screen>
  );
}
