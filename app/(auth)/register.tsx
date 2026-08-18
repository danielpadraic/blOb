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
import { getErrorMessage } from '@/utils/errors';
import { registerSchema, type RegisterValues } from '@/utils/validators';

export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [formError, setFormError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', confirmPassword: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    setInfo(null);
    try {
      const result = await signUp(values.email.trim(), values.password);
      if (result.needsEmailConfirmation) {
        setInfo('Check your inbox to confirm your email, then come back to sign in.');
      }
    } catch (error) {
      setFormError(getErrorMessage(error));
    }
  });

  return (
    <Screen scroll>
      <View className="items-center pt-6">
        <BlobMascot size={180} motion="float" />
        <AppText className="mt-6 text-3xl font-bold text-charcoal">Join the lobby</AppText>
        <AppText className="mt-2 text-center text-muted">
          Create your blob. Next, we’ll set your name, training, and a starting wallet of 50 coins.
        </AppText>
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
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.password?.message}
              hint="At least 8 characters"
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
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              error={errors.confirmPassword?.message}
            />
          )}
        />
        {formError ? (
          <AppText className="text-sm text-coral-dark">{formError}</AppText>
        ) : null}
        {info ? <AppText className="text-sm text-mint-dark">{info}</AppText> : null}
        <Button title="Create account" onPress={onSubmit} loading={isSubmitting} size="lg" />
      </View>

      <View className="mt-6 flex-row justify-center gap-1">
        <AppText className="text-muted">Already competing?</AppText>
        <Link href="/(auth)/login">
          <AppText className="font-semibold text-coral">Sign in</AppText>
        </Link>
      </View>
    </Screen>
  );
}
