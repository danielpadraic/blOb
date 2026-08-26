import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { getAuthFormMessage } from '@/utils/errors';
import { loginSchema, type LoginValues } from '@/utils/validators';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, signInWithGoogle, oauthLoading } = useAuth();
  const { authError } = useLocalSearchParams<{ authError?: string | string[] }>();
  const [emailStep, setEmailStep] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    const raw = Array.isArray(authError) ? authError[0] : authError;
    if (!raw) {
      return;
    }
    try {
      setFormError(decodeURIComponent(raw).replace(/\s+/g, ' ').trim().slice(0, 180));
    } catch {
      setFormError(raw.replace(/\s+/g, ' ').trim().slice(0, 180));
    }
  }, [authError]);
  const {
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const emailValue = watch('email');

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn(values.email.trim(), values.password);
    } catch (error) {
      reportAppError({ route: 'auth/login', error });
      setFormError(getAuthFormMessage(error));
    }
  });

  async function runGoogle() {
    setFormError(null);
    try {
      await signInWithGoogle();
    } catch (error) {
      if (isAuthCancelled(error)) {
        return;
      }
      reportAppError({ route: 'auth/login-google', error });
      setFormError(getAuthFormMessage(error));
    }
  }

  return (
    <AuthShell>
      {emailStep ? (
        <View className="mt-8 gap-4">
          <AuthBackButton onPress={() => setEmailStep(false)} />
          <Controller
            control={control}
            name="email"
            render={({ field: { onChange, onBlur, value } }) => (
              <Input
                label="Email"
                autoCapitalize="none"
                autoComplete="email"
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
                label="Password"
                secureTextEntry
                autoComplete="password"
                keyboardAppearance="dark"
                inverted
                value={value}
                onChangeText={onChange}
                onBlur={onBlur}
                error={errors.password?.message}
              />
            )}
          />
          {formError ? (
            <AppText className="text-sm" style={{ color: '#E8A0A0' }}>
              {formError}
            </AppText>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy('auth.forgotPassword')}
            hitSlop={8}
            onPress={() => {
              const href = emailValue?.trim()
                ? `/(auth)/forgot-password?email=${encodeURIComponent(emailValue.trim())}`
                : '/(auth)/forgot-password';
              router.push(href as Href);
            }}
            style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText className="text-sm font-semibold" style={{ color: THEME.accent }}>
              {copy('auth.forgotPassword')}
            </AppText>
          </Pressable>
          <Button title={copy('auth.signIn')} onPress={onSubmit} loading={isSubmitting} size="lg" />
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
            <AuthEmailButton
              disabled={isSubmitting || oauthLoading}
              onPress={() => {
                setFormError(null);
                setEmailStep(true);
              }}
            />
            <AuthGoogleButton
              disabled={isSubmitting || oauthLoading}
              loading={oauthLoading}
              onPress={() => void runGoogle()}
            />
            <AuthOrDivider />
            <AuthOutlineButton
              title="Create an Account"
              disabled={isSubmitting || oauthLoading}
              onPress={() => router.push('/(auth)/register')}
            />
          </View>
        </>
      )}
    </AuthShell>
  );
}
