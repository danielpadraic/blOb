import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable, View } from 'react-native';

import {
  AuthBackButton,
  AuthEmailButton,
  AuthGateIntro,
  AuthGoogleButton,
  AuthOrDivider,
  AuthOutlineButton,
  AuthShell,
  isAuthCancelled,
} from '@/components/auth/AuthShell';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';
import { reportAppError } from '@/lib/appErrors';
import { registerStartsOnForm } from '@/lib/authRedirect';
import { googleAuthErrorPayload } from '@/lib/googleNativeAuth';
import { getAuthFormMessage } from '@/utils/errors';
import { registerSchema, type RegisterValues } from '@/utils/validators';

export default function RegisterScreen() {
  const router = useRouter();
  const { start } = useLocalSearchParams<{ start?: string | string[] }>();
  const fromLoginForm = registerStartsOnForm(start);
  const { signUp, signInWithGoogle, oauthLoading } = useAuth();
  const [emailStep, setEmailStep] = useState(fromLoginForm);
  const [inboxEmail, setInboxEmail] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState(0);
  const lockRef = useRef(0);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  });

  useEffect(() => {
    if (lockedUntil <= 0) {
      return;
    }
    const wait = Math.max(0, lockedUntil - Date.now());
    const timer = setTimeout(() => setLockedUntil(0), wait);
    return () => clearTimeout(timer);
  }, [lockedUntil]);

  const submitAccount = handleSubmit(
    async (values) => {
      setFormError(null);
      setInfo(null);
      try {
        const result = await signUp(values.email.trim(), values.password);
        if (result.needsEmailConfirmation) {
          setInboxEmail(values.email.trim());
          setInfo(null);
          return;
        }
      } catch (error) {
        reportAppError({ route: 'auth/register', error });
        setFormError(getAuthFormMessage(error));
      }
    },
    () => {
      lockRef.current = 0;
      setLockedUntil(0);
    },
  );

  function onCreateAccount() {
    const now = Date.now();
    if (isSubmitting || now < lockRef.current) {
      return;
    }
    lockRef.current = now + 3000;
    setLockedUntil(lockRef.current);
    void submitAccount();
  }

  async function runGoogle() {
    setFormError(null);
    setInfo(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      if (isAuthCancelled(error)) {
        return;
      }
      reportAppError({
        route: 'auth/register-google',
        error,
        payload: googleAuthErrorPayload(error),
      });
      setFormError(getAuthFormMessage(error));
    }
  }

  function openEmail() {
    setFormError(null);
    setInfo(null);
    setEmailStep(true);
  }

  return (
    <AuthShell
      scrollToTopKey={inboxEmail ? 'inbox' : emailStep ? 'email' : 'gate'}
      footer={
        emailStep ? (
          <View className="gap-3">
            {inboxEmail ? null : (
              <Button
                title="Create an Account"
                onPress={onCreateAccount}
                loading={isSubmitting}
                disabled={isSubmitting || lockedUntil > Date.now()}
                size="lg"
              />
            )}
            <View className="flex-row justify-center gap-1">
              <AppText style={{ color: 'rgba(255,255,255,0.55)' }}>Already competing?</AppText>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy('auth.signIn')}
                onPress={() => router.replace('/(auth)/login')}
                hitSlop={8}
                style={{ minHeight: 44, justifyContent: 'center' }}>
                <AppText className="font-semibold" style={{ color: THEME.accent }}>
                  {copy('auth.signIn')}
                </AppText>
              </Pressable>
            </View>
          </View>
        ) : undefined
      }>
      {inboxEmail ? (
        <View className="mt-8 gap-4">
          <AppText className="text-center text-[22px] font-extrabold" style={{ color: '#FFFFFF' }}>
            {copy('auth.checkInboxTitle')}
          </AppText>
          <AppText className="text-center text-[15px] leading-6" style={{ color: 'rgba(255,255,255,0.78)' }}>
            {copy('auth.checkInboxBody', 'neutral', { email: inboxEmail })}
          </AppText>
          <Input
            key="inbox-email"
            name="email"
            label="Email"
            autoCapitalize="none"
            autoComplete="email"
            autoCorrect={false}
            textContentType="emailAddress"
            keyboardType="email-address"
            keyboardAppearance="dark"
            inverted
            value={inboxEmail}
            editable={false}
          />
        </View>
      ) : emailStep ? (
        <View className="mt-8 gap-4">
          <AuthBackButton
            onPress={() => {
              if (fromLoginForm) {
                router.replace('/(auth)/login');
                return;
              }
              setEmailStep(false);
            }}
          />
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                key="email"
                name="email"
                label="Email"
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                textContentType="emailAddress"
                keyboardType="email-address"
                keyboardAppearance="dark"
                inverted
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.email?.message}
              />
            )}
          />
          <Controller
            control={control}
            name="password"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                key="password"
                name="password"
                label="Password"
                secureTextEntry
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                keyboardAppearance="dark"
                inverted
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.password?.message}
                hint={copy('account.passwordHint')}
              />
            )}
          />
          <Controller
            control={control}
            name="confirmPassword"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                key="confirmPassword"
                name="confirmPassword"
                label="Confirm password"
                secureTextEntry
                autoComplete="new-password"
                autoCapitalize="none"
                autoCorrect={false}
                textContentType="newPassword"
                keyboardAppearance="dark"
                inverted
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.confirmPassword?.message}
              />
            )}
          />
          {formError ? (
            <AppText className="text-sm" style={{ color: '#E8A0A0' }}>
              {formError}
            </AppText>
          ) : null}
          {info ? (
            <AppText className="text-sm" style={{ color: THEME.accentBright }}>
              {info}
            </AppText>
          ) : null}
        </View>
      ) : (
        <>
          <AuthGateIntro />
          <View className="mt-6 gap-3">
            {formError ? (
              <AppText className="text-center text-sm" style={{ color: '#E8A0A0' }}>
                {formError}
              </AppText>
            ) : null}
            <AuthEmailButton disabled={isSubmitting || oauthLoading} onPress={openEmail} />
            <AuthGoogleButton
              disabled={isSubmitting || oauthLoading}
              loading={oauthLoading}
              onPress={() => void runGoogle()}
            />
            <AuthOrDivider />
            <AuthOutlineButton
              title="Create an Account"
              disabled={isSubmitting || oauthLoading}
              onPress={openEmail}
            />
          </View>
        </>
      )}
    </AuthShell>
  );
}
