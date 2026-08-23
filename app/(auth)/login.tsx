import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

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
import { reportAppError } from '@/lib/appErrors';
import { getAuthFormMessage } from '@/utils/errors';
import { loginSchema, type LoginValues } from '@/utils/validators';

export default function LoginScreen() {
  const router = useRouter();
  const { signIn, signInWithGoogle } = useAuth();
  const [emailStep, setEmailStep] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

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
              disabled={isSubmitting}
              onPress={() => {
                setFormError(null);
                setEmailStep(true);
              }}
            />
            <AuthGoogleButton disabled={isSubmitting} onPress={() => void runGoogle()} />
            <AuthOrDivider />
            <AuthOutlineButton
              title="Create an Account"
              disabled={isSubmitting}
              onPress={() => router.push('/(auth)/register')}
            />
          </View>
        </>
      )}
    </AuthShell>
  );
}
