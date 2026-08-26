import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MascotState } from '@/components/mascot/MascotState';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { KeyboardFormShell } from '@/components/ui/KeyboardFormShell';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/hooks/useAuth';
import { reportAppError } from '@/lib/appErrors';
import { copy } from '@/lib/copy';
import { TABS_HREF } from '@/lib/routes';
import { THEME } from '@/lib/theme';
import { getPasswordUpdateMessage } from '@/utils/errors';
import { setPasswordSchema, type SetPasswordValues } from '@/utils/validators';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const { session, isLoading, isPasswordRecovery, updatePassword, finishPasswordRecovery } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [waitedForSession, setWaitedForSession] = useState(false);

  useEffect(() => {
    if (session || !isPasswordRecovery) {
      return;
    }
    const timer = setTimeout(() => setWaitedForSession(true), 2500);
    return () => clearTimeout(timer);
  }, [isPasswordRecovery, session]);

  useEffect(() => {
    if (!isLoading && waitedForSession && !session && isPasswordRecovery) {
      finishPasswordRecovery();
    }
  }, [finishPasswordRecovery, isLoading, isPasswordRecovery, session, waitedForSession]);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SetPasswordValues>({
    resolver: zodResolver(setPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  if (isLoading || (isPasswordRecovery && !session && !waitedForSession)) {
    return (
      <Screen>
        <MascotState kind="loading" title={copy('auth.signingIn')} />
      </Screen>
    );
  }

  if (!session) {
    return (
      <Screen>
        <View className="flex-1 justify-center gap-4 px-1">
          <AppText className="text-[22px] font-extrabold" style={{ color: THEME.textPrimary }}>
            {copy('auth.setPasswordTitle')}
          </AppText>
          <AppText className="text-sm leading-5" style={{ color: THEME.textMuted }}>
            {copy('auth.resetLinkExpired')}
          </AppText>
          <Button
            title={copy('auth.forgotPassword')}
            onPress={() => router.replace('/(auth)/forgot-password' as Href)}
          />
        </View>
      </Screen>
    );
  }

  if (!isPasswordRecovery && !notice) {
    return <Redirect href={TABS_HREF} />;
  }

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await updatePassword(values.password);
      setNotice(copy('account.passwordUpdated'));
      finishPasswordRecovery();
      Alert.alert(copy('account.passwordUpdated'));
      router.replace(TABS_HREF);
    } catch (error) {
      reportAppError({ route: 'auth/reset-password', error });
      setFormError(getPasswordUpdateMessage(error));
    }
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: THEME.background }} edges={['top', 'left', 'right']}>
      <KeyboardFormShell
        paddingHorizontal={16}
        footer={
          <Button title={copy('auth.setPasswordTitle')} onPress={onSubmit} loading={isSubmitting} size="lg" />
        }>
        <View className="gap-4 pt-2">
          <AppText className="text-[22px] font-extrabold" style={{ color: THEME.textPrimary }}>
            {copy('auth.setPasswordTitle')}
          </AppText>
          <AppText className="text-sm leading-5" style={{ color: THEME.textMuted }}>
            {copy('auth.setPasswordBody')}
          </AppText>
          {notice ? (
            <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
              {notice}
            </AppText>
          ) : null}
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="New password"
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.password?.message}
                hint={errors.password?.message ? undefined : copy('account.passwordHint')}
              />
            )}
          />
          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Confirm password"
                secureTextEntry
                autoComplete="new-password"
                textContentType="newPassword"
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.confirmPassword?.message}
              />
            )}
          />
          {formError ? (
            <AppText className="text-sm" style={{ color: THEME.danger }}>
              {formError}
            </AppText>
          ) : null}
        </View>
      </KeyboardFormShell>
    </SafeAreaView>
  );
}
