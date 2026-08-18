import { zodResolver } from '@hookform/resolvers/zod';
import { Link } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { BlobMascot } from '@/components/mascot/BlobMascot';
import { AuthDivider, SocialAuth } from '@/components/ui/SocialAuth';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { copy } from '@/lib/copy';
import { getErrorMessage } from '@/utils/errors';
import { loginSchema, type LoginValues } from '@/utils/validators';

export default function LoginScreen() {
  const { signIn } = useAuth();
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
      setFormError(getErrorMessage(error));
    }
  });

  return (
    <Screen scroll>
      <View className="items-center pt-6">
        <BlobMascot variant="logo" size={220} motion="float" />
        <AppText className="mt-6 text-3xl font-bold text-charcoal">{copy('auth.welcome')}</AppText>
        <AppText className="mt-2 text-center text-muted">{copy('auth.subtitle')}</AppText>
      </View>

      <View className="mt-8">
        <SocialAuth busy={isSubmitting} onError={setFormError} />
        <AuthDivider />
      </View>

      <View className="gap-4">
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, onBlur, value } }) => (
            <Input
              label="Email"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
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
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.password?.message}
            />
          )}
        />
        {formError ? (
          <AppText className="text-sm text-coral-dark">{formError}</AppText>
        ) : null}
        <Button title={copy('auth.signIn')} onPress={onSubmit} loading={isSubmitting} size="lg" />
      </View>

      <View className="mt-6 flex-row justify-center gap-1">
        <AppText className="text-muted">{copy('auth.newHere')}</AppText>
        <Link href="/(auth)/register">
          <AppText className="font-semibold text-coral">{copy('auth.createAccount')}</AppText>
        </Link>
      </View>
    </Screen>
  );
}
