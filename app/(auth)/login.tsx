import { zodResolver } from '@hookform/resolvers/zod';
import { Link, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { LoginHero } from '@/components/auth/LoginHero';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';
import { loginSchema, type LoginValues } from '@/utils/validators';

const LOGIN_BG = '#000000';

function isAuthCancelled(error: unknown): boolean {
  if (typeof error === 'object' && error && 'code' in error) {
    if (String(error.code).toLowerCase().includes('cancel')) {
      return true;
    }
  }
  return error instanceof Error && error.message.toLowerCase().includes('cancel');
}

export default function LoginScreen() {
  const { signIn, signInWithGoogle, signInWithApple } = useAuth();
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
      setFormError(getErrorMessage(error));
    }
  });

  async function runSocial(action: () => Promise<void>) {
    setFormError(null);
    try {
      await action();
    } catch (error) {
      if (isAuthCancelled(error)) {
        return;
      }
      setFormError(
        error instanceof Error ? error.message : 'That sign-in didn’t finish. Please try again.',
      );
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: LOGIN_BG }} edges={['top', 'left', 'right', 'bottom']}>
      <Stack.Screen options={{ contentStyle: { backgroundColor: LOGIN_BG } }} />
      <StatusBar style="light" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView
          style={{ flex: 1, backgroundColor: LOGIN_BG }}
          contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 22, paddingBottom: 16 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View className="items-center pt-4">
            <AppText className="text-[34px] font-extrabold tracking-tight" style={{ color: '#FFFFFF' }}>
              bl
              <AppText className="text-[34px] font-extrabold" style={{ color: THEME.accent }}>
                O
              </AppText>
              b
            </AppText>
            <AppText className="mt-2 text-[15px] font-medium" style={{ color: '#FFFFFF' }}>
              Movement. Community. Growth.
            </AppText>
            <AppText className="mt-1 text-[14px] font-semibold" style={{ color: THEME.accent }}>
              Small decisions. Big future.
            </AppText>
          </View>

          {emailStep ? (
            <View className="mt-8 gap-4">
              <Pressable
                onPress={() => setEmailStep(false)}
                accessibilityRole="button"
                accessibilityLabel="Back"
                hitSlop={12}
                style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
                <AppText className="text-[15px] font-semibold" style={{ color: THEME.accent }}>
                  Back
                </AppText>
              </Pressable>
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
              <LoginHero />
              <View className="mt-2">
                <AppText className="text-center text-[22px] font-extrabold" style={{ color: '#FFFFFF' }}>
                  Join blOb.
                </AppText>
                <AppText
                  className="mt-2 text-center text-[13px] leading-5"
                  style={{ color: 'rgba(255,255,255,0.78)' }}>
                  Track your progress. Compete in challenges. Build habits that last.
                </AppText>
              </View>

              <View className="mt-6 gap-3">
                {formError ? (
                  <AppText className="text-center text-sm" style={{ color: '#E8A0A0' }}>
                    {formError}
                  </AppText>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Email"
                  disabled={isSubmitting}
                  onPress={() => {
                    setFormError(null);
                    setEmailStep(true);
                  }}
                  style={{ borderRadius: 16, overflow: 'hidden', minHeight: 56 }}>
                  <LinearGradient
                    colors={['#2C9B89', '#1E7A6C']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={{
                      minHeight: 56,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 10,
                      paddingHorizontal: 16,
                    }}>
                    <EnvelopeIcon />
                    <AppText className="text-[16px] font-semibold" style={{ color: '#FFFFFF' }}>
                      Continue with Email
                    </AppText>
                  </LinearGradient>
                </Pressable>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Continue with Google"
                  disabled={isSubmitting}
                  onPress={() => void runSocial(signInWithGoogle)}
                  style={{
                    minHeight: 56,
                    borderRadius: 16,
                    backgroundColor: '#1C1C1E',
                    alignItems: 'center',
                    justifyContent: 'center',
                    opacity: isSubmitting ? 0.38 : 1,
                  }}>
                  <AppText className="text-[16px] font-semibold" style={{ color: '#FFFFFF' }}>
                    Continue with Google
                  </AppText>
                </Pressable>

                {Platform.OS === 'ios' ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Continue with Apple"
                    disabled={isSubmitting}
                    onPress={() => void runSocial(signInWithApple)}
                    style={{
                      minHeight: 56,
                      borderRadius: 16,
                      backgroundColor: '#1C1C1E',
                      alignItems: 'center',
                      justifyContent: 'center',
                      opacity: isSubmitting ? 0.38 : 1,
                    }}>
                    <AppText className="text-[16px] font-semibold" style={{ color: '#FFFFFF' }}>
                      Continue with Apple
                    </AppText>
                  </Pressable>
                ) : null}

                <View className="my-1 flex-row items-center gap-3">
                  <View className="h-px flex-1" style={{ backgroundColor: 'rgba(255,255,255,0.18)' }} />
                  <AppText className="text-[12px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    or
                  </AppText>
                  <View className="h-px flex-1" style={{ backgroundColor: 'rgba(255,255,255,0.18)' }} />
                </View>

                <Link href="/(auth)/register" asChild>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Create an Account"
                    style={{
                      minHeight: 56,
                      borderRadius: 16,
                      borderWidth: 1.5,
                      borderColor: THEME.accent,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                    <AppText className="text-[16px] font-semibold" style={{ color: THEME.accent }}>
                      Create an Account
                    </AppText>
                  </Pressable>
                </Link>
              </View>
            </>
          )}

          <View className="mt-auto items-center pt-8">
            <AppText className="text-center text-[12px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
              <AppText style={{ color: THEME.accent }}>♥ </AppText>
              Made by humans. Inspired by Bob.
            </AppText>
            <AppText className="mt-2 text-[13px] font-semibold" style={{ color: THEME.accent }}>
              You’ve got this.
            </AppText>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function EnvelopeIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" accessibilityElementsHidden>
      <Rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="#FFFFFF" strokeWidth="1.8" />
      <Path d="M4 7l8 6 8-6" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinejoin="round" />
    </Svg>
  );
}
