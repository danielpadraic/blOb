import { useCallback, useEffect, useRef, useState } from 'react';
import { Tabs, usePathname, useRouter, useSegments, type Href } from 'expo-router';
import { AppState, Platform, StyleSheet, View, type AppStateStatus } from 'react-native';

import { BlobTabBar } from '@/components/navigation/BlobTabBar';
import { QuickActionSheet, type QuickActionId } from '@/components/navigation/QuickActionSheet';
import { AlertsOverlay } from '@/components/notifications/AlertsOverlay';
import { SearchOverlay } from '@/components/search/SearchOverlay';
import { closeMediaLightbox, MediaLightboxHost } from '@/components/feed/MediaLightbox';
import { closeSocialSheets, SocialSheetsHost } from '@/components/social/SocialSheets';
import { JoinConfirmLayer, JoinConfirmProvider } from '@/components/challenge/JoinConfirmHost';
import { InviteHost } from '@/components/challenge/InviteHost';
import { OfficialPitchHost } from '@/components/challenge/OfficialPitchHost';
import { BugReportHost } from '@/components/bug/BugReportHost';
import { AppErrorBoundary } from '@/components/ui/AppErrorBoundary';
import { TourHost } from '@/components/tour/TourHost';
import { CreateTourHost } from '@/components/tour/CreateTourHost';
import { TourProvider, useTour } from '@/components/tour/TourContext';
import {
  TabChromeHeader,
  isAlertsTab,
  isChallengeIdRoute,
  type LogoMenuAction,
} from '@/components/wallet/TabChrome';
import { WalletHost } from '@/components/wallet/WalletHost';
import { useLoggableChallenges, type LoggableChallenge } from '@/hooks/useLoggableChallenge';
import { useNotificationsRealtime } from '@/hooks/useNotifications';
import { HealthLogPromptHost } from '@/components/health/HealthLogPrompt';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useMyProfile } from '@/hooks/useProfile';
import { useTickUserGrants } from '@/hooks/useUserGrants';
import { useWalletOptional } from '@/hooks/useWallet';
import { isWalletReadyForHomeTour, wasHomeTourCompleted } from '@/lib/homeTour';
import { CAPTURE_REEL_HREF, LOBBY_HREF } from '@/lib/routes';
import { primeCameraFromGesture } from '@/lib/cameraSession';
import { rememberLastCapture } from '@/lib/lastCapture';
import { startFreshWaveCapture } from '@/lib/waveCapture';
import { shouldResetToHomeOnLaunch, shouldReturnHomeOnResume } from '@/lib/appResume';
import { THEME } from '@/lib/theme';
import * as Linking from 'expo-linking';

export { AppErrorBoundary as ErrorBoundary };

export const unstable_settings = {
  initialRouteName: 'feed',
};

export default function TabLayout() {
  return (
    <TourProvider>
      <JoinConfirmProvider>
        <BugReportHost>
          <TabLayoutInner />
        </BugReportHost>
      </JoinConfirmProvider>
    </TourProvider>
  );
}

function FirstRunTourLauncher() {
  const { profile, isFetched } = useMyProfile();
  const tour = useTour();
  const router = useRouter();
  const pathname = usePathname();
  const started = useRef(false);
  const [walletWaitExpired, setWalletWaitExpired] = useState(false);
  const start = tour.start;
  const active = tour.active;
  const onOnboarding = pathname.startsWith('/onboarding');
  const walletReady = isWalletReadyForHomeTour(profile);
  const alreadyDone = wasHomeTourCompleted(profile?.id, profile?.tutorial_completed_at);

  useEffect(() => {
    started.current = false;
    setWalletWaitExpired(false);
  }, [profile?.id]);

  useEffect(() => {
    if (!isFetched || !profile || walletReady || alreadyDone) {
      return;
    }
    const handle = setTimeout(() => setWalletWaitExpired(true), 2500);
    return () => clearTimeout(handle);
  }, [alreadyDone, isFetched, profile, walletReady]);

  useEffect(() => {
    if (
      onOnboarding ||
      active ||
      tour.createActive ||
      !profile ||
      alreadyDone ||
      !isFetched ||
      (!walletReady && !walletWaitExpired)
    ) {
      return;
    }
    router.navigate('/feed');
    const handle = setTimeout(() => {
      if (started.current || tour.createActive || wasHomeTourCompleted(profile.id, profile.tutorial_completed_at)) {
        return;
      }
      started.current = true;
      start();
    }, 450);
    return () => clearTimeout(handle);
  }, [
    active,
    alreadyDone,
    isFetched,
    onOnboarding,
    profile,
    router,
    start,
    tour.createActive,
    walletReady,
    walletWaitExpired,
  ]);

  return null;
}

function TabLayoutInner() {
  const router = useRouter();
  const segments = useSegments();
  const pathname = usePathname();
  const onOnboarding = pathname.startsWith('/onboarding');
  const wallet = useWalletOptional();
  const { profile, refetch } = useMyProfile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [logoMenuOpen, setLogoMenuOpen] = useState(false);
  const loggable = useLoggableChallenges();
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const backgroundedAt = useRef<number | null>(null);
  const pathRef = useRef(pathname);
  const launchPath = useRef(pathname);
  pathRef.current = pathname;
  useNotificationsRealtime();
  usePushNotifications();
  useTickUserGrants(true);

  const closeOverlays = useCallback(() => {
    setAlertsOpen(false);
    setSearchOpen(false);
    setSheetOpen(false);
    setLogoMenuOpen(false);
    closeSocialSheets();
    closeMediaLightbox();
    wallet?.closeAll();
  }, [wallet]);

  const closeAlerts = useCallback(() => {
    setAlertsOpen(false);
  }, []);

  function toggleAlerts() {
    if (alertsOpen) {
      setAlertsOpen(false);
      return;
    }
    if (isAlertsTab(segments)) {
      router.navigate('/feed');
      return;
    }
    setSearchOpen(false);
    setSheetOpen(false);
    setLogoMenuOpen(false);
    wallet?.closeAll();
    setAlertsOpen(true);
  }

  function toggleSearch() {
    if (searchOpen) {
      setSearchOpen(false);
      return;
    }
    setAlertsOpen(false);
    setSheetOpen(false);
    setLogoMenuOpen(false);
    wallet?.closeAll();
    setSearchOpen(true);
  }

  function toggleSheet() {
    if (sheetOpen) {
      setSheetOpen(false);
      return;
    }
    setAlertsOpen(false);
    setSearchOpen(false);
    setLogoMenuOpen(false);
    closeSocialSheets();
    wallet?.closeAll();
    setSheetOpen(true);
  }

  function toggleLogoMenu() {
    if (logoMenuOpen) {
      setLogoMenuOpen(false);
      return;
    }
    setAlertsOpen(false);
    setSearchOpen(false);
    setSheetOpen(false);
    closeSocialSheets();
    wallet?.closeAll();
    setLogoMenuOpen(true);
  }

  useEffect(() => {
    if (onOnboarding) {
      return;
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      void Promise.resolve(Linking.getInitialURL())
        .catch(() => null)
        .then((initialUrl) => {
          if (cancelled) {
            return;
          }
          const linkingUrl =
            typeof Linking.getLinkingURL === 'function' ? Linking.getLinkingURL() : null;
          if (
            pathRef.current !== '/feed' &&
            shouldResetToHomeOnLaunch({
              pathname: launchPath.current,
              initialUrl: linkingUrl || initialUrl,
              platform: Platform.OS,
            })
          ) {
            router.replace('/feed');
          }
        });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [onOnboarding, router]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const previous = appState.current;
      if (next === 'background') {
        backgroundedAt.current = Date.now();
      }
      if (
        shouldReturnHomeOnResume({
          previous,
          next,
          backgroundedAt: backgroundedAt.current,
          now: Date.now(),
          pathname,
          platform: Platform.OS,
        })
      ) {
        backgroundedAt.current = null;
        appState.current = next;
        router.replace('/feed');
        return;
      }
      if (next === 'active') {
        backgroundedAt.current = null;
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [pathname, router]);

  function go(href: Href) {
    closeOverlays();
    setTimeout(() => router.push(href), 60);
  }

  function onAction(id: QuickActionId, challenge?: LoggableChallenge) {
    if (id === 'log') {
      const picked = challenge?.id;
      if (!picked) {
        return;
      }
      go(`/challenges/${picked}/submit`);
      return;
    }
    if (id === 'create') {
      const root = (segments as string[]).filter((segment) => !segment.startsWith('('))[0];
      go(root === 'feed' ? '/challenges/create?returnTo=feed' : '/challenges/create');
      return;
    }
    if (id === 'join') {
      go('/challenges');
      return;
    }
    if (id === 'post') {
      go('/feed/compose');
      return;
    }
    if (id === 'story') {
      closeOverlays();
      startFreshWaveCapture(router);
      return;
    }
    if (id === 'reel') {
      // Action id stays `reel`; capture URL stays mode=reel. User-facing name is Round.
      closeOverlays();
      rememberLastCapture(null);
      void primeCameraFromGesture('video').then(() => {
        setTimeout(() => router.push(CAPTURE_REEL_HREF), 60);
      });
      return;
    }
    if (id === 'coins') {
      setSheetOpen(false);
      setAlertsOpen(false);
      wallet?.openSend();
      return;
    }
    if (id === 'callout') {
      go('/challenges/callout/create');
    }
  }

  const friendsTabRoot = pathname === '/friends';

  return (
    <MediaLightboxHost>
    <View className="flex-1" style={{ backgroundColor: THEME.background }}>
      {isChallengeIdRoute(segments as string[]) || pathname.includes('/capture') ? null : (
        <TabChromeHeader
          alertsOpen={alertsOpen}
          searchOpen={searchOpen}
          logoMenuOpen={logoMenuOpen}
          onToggleAlerts={toggleAlerts}
          onToggleSearch={toggleSearch}
          onToggleLogoMenu={toggleLogoMenu}
          onLogoAction={(id: LogoMenuAction) => onAction(id)}
        />
      )}
      <View
        className="flex-1"
        style={{ overflow: friendsTabRoot ? 'visible' : 'hidden', minHeight: 0 }}>
        <InviteHost>
        <SocialSheetsHost>
        <Tabs
          tabBar={() => null}
          screenOptions={{
            headerShown: false,
            tabBarStyle: { display: 'none' },
          }}>
          <Tabs.Screen name="feed" options={{ title: 'Home' }} listeners={{ tabPress: closeOverlays }} />
          <Tabs.Screen
            name="challenges"
            options={{
              title: 'Lobby',
              href: LOBBY_HREF,
              popToTopOnBlur: true,
            }}
            listeners={{ tabPress: closeOverlays }}
          />
          <Tabs.Screen
            name="compose"
            options={{
              title: '',
              href: null,
            }}
          />
          <Tabs.Screen
            name="friends"
            options={{
              title: 'Friends',
              sceneStyle: { flex: 1, minHeight: 0, overflow: 'visible' },
            }}
            listeners={{ tabPress: closeOverlays }}
          />
          <Tabs.Screen name="notifications" options={{ href: null, title: 'Alerts' }} />
          <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
          <Tabs.Screen name="capture" options={{ href: null, title: 'Capture' }} />
          <Tabs.Screen
            name="profile"
            options={{
              title: 'You',
              href: '/profile',
              popToTopOnBlur: true,
            }}
            listeners={{ tabPress: closeOverlays }}
          />
        </Tabs>
        <AlertsOverlay visible={alertsOpen} onClose={closeAlerts} />
        <SearchOverlay visible={searchOpen} onClose={() => setSearchOpen(false)} />
        <HealthLogPromptHost />
        {onOnboarding ? null : <OfficialPitchHost />}
        </SocialSheetsHost>
        </InviteHost>
      </View>
      {onOnboarding || pathname.includes('/capture') ? null : (
        <BlobTabBar
          composeOpen={sheetOpen}
          onToggleCompose={toggleSheet}
          onTabPress={closeOverlays}
        />
      )}
      <View
        pointerEvents={sheetOpen ? 'auto' : 'none'}
        style={styles.sheetLayer}>
        <QuickActionSheet
          visible={sheetOpen}
          loggable={loggable.data}
          onClose={() => setSheetOpen(false)}
          onAction={onAction}
        />
      </View>
      <JoinConfirmLayer />
      <View pointerEvents="box-none" style={styles.chromeLayer}>
        <WalletHost />
      </View>
      {onOnboarding ? null : (
        <>
          <FirstRunTourLauncher />
          <View pointerEvents="box-none" style={styles.tourLayer}>
            <TourHost onFinished={() => void refetch()} />
            <CreateTourHost />
          </View>
        </>
      )}
    </View>
    </MediaLightboxHost>
  );
}

const styles = StyleSheet.create({
  sheetLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 120,
    elevation: 120,
  },
  chromeLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 210,
    elevation: 210,
  },
  tourLayer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 4000,
    elevation: 4000,
  },
});
