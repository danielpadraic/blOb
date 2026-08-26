import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { LoginHero } from '@/components/auth/LoginHero';
import { AppText } from '@/components/ui/AppText';
import { KeyboardFormShell } from '@/components/ui/KeyboardFormShell';
import { THEME } from '@/lib/theme';

export const AUTH_BG = '#000000';

export function isAuthCancelled(error: unknown): boolean {
  if (typeof error === 'object' && error && 'code' in error) {
    if (String(error.code).toLowerCase().includes('cancel')) {
      return true;
    }
  }
  return error instanceof Error && error.message.toLowerCase().includes('cancel');
}

export function AuthShell({
  children,
  footer,
  scrollToTopKey,
}: {
  children: ReactNode;
  footer?: ReactNode;
  scrollToTopKey?: string | number;
}) {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: AUTH_BG }} edges={['top', 'left', 'right']}>
      <Stack.Screen options={{ contentStyle: { backgroundColor: AUTH_BG } }} />
      <StatusBar style="light" />
      <KeyboardFormShell
        footer={footer}
        scrollToTopKey={scrollToTopKey}
        backgroundColor={AUTH_BG}
        tone="dark"
        paddingHorizontal={22}>
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
        {children}
        {footer ? null : (
          <View className="mt-auto items-center pt-8">
            <AppText className="text-center text-[12px]" style={{ color: 'rgba(255,255,255,0.55)' }}>
              <AppText style={{ color: THEME.accent }}>♥ </AppText>
              Made by humans. Inspired by Bob.
            </AppText>
            <AppText className="mt-2 text-[13px] font-semibold" style={{ color: THEME.accent }}>
              You’ve got this.
            </AppText>
          </View>
        )}
      </KeyboardFormShell>
    </SafeAreaView>
  );
}

export function AuthGateIntro() {
  return (
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
    </>
  );
}

export function AuthEmailButton({
  onPress,
  disabled,
}: {
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Continue with Email"
      disabled={disabled}
      onPress={onPress}
      style={{ borderRadius: 16, overflow: 'hidden', minHeight: 56, opacity: disabled ? 0.38 : 1 }}>
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
  );
}

export function AuthGoogleButton({
  onPress,
  disabled,
  loading,
}: {
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
}) {
  const isDisabled = Boolean(disabled || loading);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Continue with Google"
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      disabled={isDisabled}
      onPress={onPress}
      style={{
        minHeight: 56,
        borderRadius: 16,
        backgroundColor: '#1C1C1E',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: isDisabled ? 0.38 : 1,
      }}>
      {loading ? (
        <ActivityIndicator color="#FFFFFF" />
      ) : (
        <AppText className="text-[16px] font-semibold" style={{ color: '#FFFFFF' }}>
          Continue with Google
        </AppText>
      )}
    </Pressable>
  );
}

export function AuthOutlineButton({
  title,
  onPress,
  disabled,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 56,
        borderRadius: 16,
        borderWidth: 1.5,
        borderColor: THEME.accent,
        alignItems: 'center',
        justifyContent: 'center',
        opacity: disabled ? 0.38 : 1,
      }}>
      <AppText className="text-[16px] font-semibold" style={{ color: THEME.accent }}>
        {title}
      </AppText>
    </Pressable>
  );
}

export function AuthOrDivider() {
  return (
    <View className="my-1 flex-row items-center gap-3">
      <View className="h-px flex-1" style={{ backgroundColor: 'rgba(255,255,255,0.18)' }} />
      <AppText className="text-[12px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
        or
      </AppText>
      <View className="h-px flex-1" style={{ backgroundColor: 'rgba(255,255,255,0.18)' }} />
    </View>
  );
}

export function AuthBackButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={12}
      style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
      <AppText className="text-[15px] font-semibold" style={{ color: THEME.accent }}>
        Back
      </AppText>
    </Pressable>
  );
}

function EnvelopeIcon() {
  return (
    <View accessible={false} importantForAccessibility="no" pointerEvents="none">
      <Svg width={18} height={18} viewBox="0 0 24 24" focusable={false}>
        <Rect x="3" y="5" width="18" height="14" rx="2" fill="none" stroke="#FFFFFF" strokeWidth="1.8" />
        <Path d="M4 7l8 6 8-6" fill="none" stroke="#FFFFFF" strokeWidth="1.8" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}
