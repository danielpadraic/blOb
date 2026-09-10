import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { AuthBackButton, AuthShell } from '@/components/auth/AuthShell';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { reportAppError } from '@/lib/appErrors';
import { peekPendingAuthEmail, takePendingAuthEmail } from '@/lib/authFormMemory';
import { copy } from '@/lib/copy';
import { getErrorMessage } from '@/utils/errors';
import { forgotPasswordSchema, type ForgotPasswordValues } from '@/utils/validators';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const queryEmail = (Array.isArray(params.email) ? params.email[0] : params.email)?.trim() ?? '';
  const [seedEmail] = useState(() => peekPendingAuthEmail() || queryEmail);
  const { resetPasswordForEmail } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: seedEmail },
  });

  useEffect(() => {
    takePendingAuthEmail();
  }, []);

  useEffect(() => {
    if (!queryEmail) {
      return;
    }
    setValue('email', queryEmail);
    router.replace('/(auth)/forgot-password' as Href);
  }, [queryEmail, router, setValue]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setInfo(null);
    try {
      await resetPasswordForEmail(values.email.trim());
      setInfo(copy('auth.resetEmailSent'));
    } catch (error) {
      reportAppError({ route: 'auth/forgot-password', error });
      const raw =
        error && typeof error === 'object' && 'message' in error && typeof error.message === 'string'
          ? error.message.trim()
          : '';
      setFormError(raw || getErrorMessage(error));
    }
  });

  return (
    <AuthShell
      scrollToTopKey="reset"
      footer={
        <Button title={copy('auth.sendResetLink')} onPress={onSubmit} loading={isSubmitting} size="lg" />
      }>
      <View className="mt-8 gap-4">
        <AuthBackButton onPress={() => router.back()} />
        <AppText className="text-[22px] font-extrabold" style={{ color: '#FFFFFF' }}>
          {copy('auth.forgotPassword')}
        </AppText>
        <AppText className="text-sm leading-5" style={{ color: 'rgba(255,255,255,0.78)' }}>
          Enter your email and we’ll send a reset link.
        </AppText>
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
        {formError ? (
          <AppText className="text-sm" style={{ color: '#E8A0A0' }}>
            {formError}
          </AppText>
        ) : null}
        {info ? (
          <AppText className="text-sm" style={{ color: '#72D9CB' }}>
            {info}
          </AppText>
        ) : null}
      </View>
    </AuthShell>
  );
}
