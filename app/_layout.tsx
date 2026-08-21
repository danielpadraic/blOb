import '../global.css';
import 'react-native-gesture-handler';
import '@/lib/nativewind';

import { QueryClientProvider } from '@tanstack/react-query';
import { Stack, usePathname, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppErrorBoundary } from '@/components/ui/AppErrorBoundary';
import { BlobMascot } from '@/components/mascot/BlobMascot';
import { AppText } from '@/components/ui/AppText';
import { MascotState } from '@/components/mascot/MascotState';
import { AuthProvider, useAuth } from '@/hooks/useAuth';
import { WalletProvider } from '@/hooks/useWallet';
import { useMyProfile } from '@/hooks/useProfile';
import { useAppOpenPing } from '@/hooks/useAppOpenPing';
import { takePendingInviteToken } from '@/lib/challengeInvites';
import { inviteHref } from '@/lib/routes';
import { THEME } from '@/lib/theme';
import { queryClient } from '@/lib/queryClient';
import { paymentsProviderError } from '@/services/payments';
import { isProfileComplete } from '@/utils/validators';

export { AppErrorBoundary as ErrorBoundary };

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
            <AppFrame>
              <RootNavigator />
            </AppFrame>
          </WalletProvider>
        </AuthProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

function RootNavigator() {
  const { isLoading, isConfigured, session } = useAuth();
  const { isBootstrapping, path, profile } = useMyProfile();
  const pathname = usePathname();
  const onOnboarding = pathname.startsWith('/onboarding');
  const [bootExpired, setBootExpired] = useState(false);
  const blocking = isLoading || isBootstrapping || path === 'boot';
  useAppOpenPing();

  useEffect(() => {
    if (!blocking) {
      setBootExpired(false);
      return;
    }
    const handle = setTimeout(() => setBootExpired(true), 2000);
    return () => clearTimeout(handle);
  }, [blocking]);

  const resolvedPath = useMemo(() => {
    if (path !== 'boot') {
      return path;
    }
    if (!bootExpired) {
      return 'boot';
    }
    if (!session) {
      return 'auth';
    }
    return isProfileComplete(profile) ? 'app' : 'setup';
  }, [bootExpired, path, profile, session]);
  const keepSetupMounted = resolvedPath === 'setup' || (resolvedPath === 'app' && onOnboarding);

  useEffect(() => {
    if (!blocking || bootExpired) {
      void SplashScreen.hideAsync();
    }
  }, [blocking, bootExpired]);

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

  const paymentsError = paymentsProviderError();
  if (paymentsError) {
    return (
      <View className="flex-1" style={{ backgroundColor: THEME.background }}>
        <MascotState kind="error" title="Payments are not wired up" body={paymentsError} />
      </View>
    );
  }

  // Session + profile check must always resolve. A missing profile is onboarding, not a hang.
  if (blocking && !bootExpired && path === 'boot') {
    return <BootSplash />;
  }

  return (
    <>
      <PendingInviteRedirect ready={resolvedPath === 'app'} />
      <Stack screenOptions={ROOT_STACK_OPTIONS}>
        <Stack.Protected guard={resolvedPath === 'auth'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={keepSetupMounted}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Screen name="index" />
        <Stack.Screen name="auth" />
        <Stack.Screen name="invite/[token]" />
        <Stack.Protected guard={resolvedPath === 'app'}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="admin" options={{ headerShown: false }} />
          {/* Route group `story` stays so `/story/[id]` links keep working. User-facing name is Wave. */}
          <Stack.Screen name="story" options={{ headerShown: false, animation: 'fade' }} />
        </Stack.Protected>
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}

function BootSplash() {
  return (
    <View className="flex-1 items-center justify-center" style={{ backgroundColor: THEME.background }}>
      <BlobMascot size={220} motion="pulse" />
      <AppText className="mt-6" style={{ color: THEME.textMuted }}>
        blOb is waking up…
      </AppText>
    </View>
  );
}

function AppFrame({ children }: { children: ReactNode }) {
  if (Platform.OS !== 'web') {
    return children;
  }
  return (
    <View style={{ flex: 1, alignItems: 'center', backgroundColor: THEME.primary }}>
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 430,
          backgroundColor: THEME.background,
          overflow: 'hidden',
        }}>
        {children}
      </View>
    </View>
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
