import '../global.css';
import 'react-native-gesture-handler';
import '@/lib/nativewind';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { BlobMascot } from '@/components/mascot/BlobMascot';
import { MascotState } from '@/components/mascot/MascotState';
import { AppText } from '@/components/ui/AppText';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { WalletProvider } from '@/hooks/useWallet';
import { useMyProfile } from '@/hooks/useProfile';
import { takePendingInviteToken } from '@/lib/challengeInvites';
import { inviteHref } from '@/lib/routes';
import { THEME } from '@/lib/theme';
import { queryClient } from '@/lib/queryClient';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

const ROOT_STACK_OPTIONS = {
  headerShown: false,
  contentStyle: { backgroundColor: THEME.background },
} as const;

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <WalletProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </WalletProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { isLoading, isConfigured } = useAuth();
  const { isBootstrapping, path } = useMyProfile();

  useEffect(() => {
    if (!isLoading && !isBootstrapping) {
      void SplashScreen.hideAsync();
    }
  }, [isBootstrapping, isLoading]);

  if (!isConfigured) {
    return (
      <View className="flex-1" style={{ backgroundColor: THEME.background }}>
        <MascotState
          kind="error"
          title="Supabase is not wired up"
          body="Copy .env.example to .env and add EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY. Then run the SQL in supabase/schema.sql."
        />
      </View>
    );
  }

  // Session + profile check must always resolve. A missing profile is onboarding, not a hang.
  if (isLoading || isBootstrapping || path === 'boot') {
    return <BootScreen />;
  }

  return (
    <>
      <PendingInviteRedirect ready={path === 'app'} />
      <Stack screenOptions={ROOT_STACK_OPTIONS}>
        <Stack.Protected guard={path === 'auth'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={path === 'setup'}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="invite/[token]" />
        <Stack.Protected guard={path === 'app'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="story" options={{ headerShown: false, animation: 'fade' }} />
          <Stack.Screen name="messages" options={{ headerShown: false }} />
        </Stack.Protected>
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}

function PendingInviteRedirect({ ready }: { ready: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const consumed = useRef(false);

  useEffect(() => {
    if (!ready || consumed.current) {
      return;
    }
    if (pathname.startsWith('/invite') || pathname.startsWith('/challenges')) {
      return;
    }
    consumed.current = true;
    let cancelled = false;
    void takePendingInviteToken().then((token) => {
      if (cancelled || !token) {
        return;
      }
      router.replace(inviteHref(token));
    });
    return () => {
      cancelled = true;
    };
  }, [pathname, ready, router]);

  return null;
}

function BootScreen() {
  return (
    <View className="flex-1 items-center justify-center" style={{ backgroundColor: THEME.background }}>
      <BlobMascot size={220} motion="pulse" />
      <AppText className="mt-6" style={{ color: THEME.textMuted }}>
        blOb is waking up…
      </AppText>
    </View>
  );
}
