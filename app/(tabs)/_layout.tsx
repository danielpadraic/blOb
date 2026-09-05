import { useCallback, useEffect, useRef, useState } from 'react';
import { Tabs, usePathname, useRouter, useSegments, type Href } from 'expo-router';
import { AppState, Platform, StyleSheet, View, type AppStateStatus } from 'react-native';

import { BlobTabBar } from '@/components/navigation/BlobTabBar';
import { PlusActionBar, type QuickActionId } from '@/components/navigation/PlusActionBar';
import { AlertsOverlay } from '@/components/notifications/AlertsOverlay';
import { SearchOverlay } from '@/components/search/SearchOverlay';
import { closeMediaLightbox, MediaLightboxHost } from '@/components/feed/MediaLightbox';
import { closeSocialSheets, SocialSheetsHost } from '@/components/social/SocialSheets';
import { JoinConfirmLayer, JoinConfirmProvider } from '@/components/challenge/JoinConfirmHost';
import { InviteHost } from '@/components/challenge/InviteHost';
import { OfficialPitchHost } from '@/components/challenge/OfficialPitchHost';
import { InterestsHomeHost } from '@/components/interests/InterestsHomeHost';
import { OfficialDobProvider } from '@/components/interests/OfficialDobHost';
import { GeoCashProvider } from '@/components/geo/GeoCashHost';
import { BugReportHost } from '@/components/bug/BugReportHost';
import { AppErrorBoundary } from '@/components/ui/AppErrorBoundary';
import { TourHost } from '@/components/tour/TourHost';
import { CreateTourHost } from '@/components/tour/CreateTourHost';
import { TourProvider, useTour, useTourOptional } from '@/components/tour/TourContext';
import {
  TabChromeHeader,
  isAlertsTab,
  isChallengeIdRoute,
  isCircleIdRoute,
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
import { clearLastOpenChallenge, goHome, pushCheckinSubmit } from '@/lib/challengeNav';
import { CIRCLES_CREATE_HREF, isWatchSurfacePath, LOBBY_HREF, MULTI_CHECKIN_HREF } from '@/lib/routes';
import { isLiveCameraPath, stopAllLiveMedia, stopMediaUnlessCameraPath } from '@/lib/cameraSession';
import { startFreshRoundCapture, startFreshWaveCapture } from '@/lib/waveCapture';
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
      <OfficialDobProvider>
        <GeoCashProvider>
        <JoinConfirmProvider>
        <BugReportHost>
          <TabLayoutInner />
        </BugReportHost>
        </JoinConfirmProvider>
        </GeoCashProvider>
      </OfficialDobProvider>
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
  const [messagesOpen, setMessagesOpen] = useState(false);
  const tour = useTourOptional();
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
    setMessagesOpen(false);
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
    setMessagesOpen(false);
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
    setMessagesOpen(false);
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
    setMessagesOpen(false);
    closeSocialSheets();
    wallet?.closeAll();
    setSheetOpen(true);
  }

  function toggleMessages() {
    if (messagesOpen) {
      setMessagesOpen(false);
      return;
    }
    setAlertsOpen(false);
    setSearchOpen(false);
    setSheetOpen(false);
    setLogoMenuOpen(false);
    closeSocialSheets();
    wallet?.closeAll();
    setMessagesOpen(true);
  }

  function toggleLogoMenu() {
    if (logoMenuOpen) {
      setLogoMenuOpen(false);
      return;
    }
    setAlertsOpen(false);
    setSearchOpen(false);
    setSheetOpen(false);
    setMessagesOpen(false);
    closeSocialSheets();
    wallet?.closeAll();
    setLogoMenuOpen(true);
  }

  function onHomePress() {
    closeOverlays();
    if (pathname === '/feed' || pathname === '/feed/') {
      goHome(router, { alreadyHome: true, after: () => tour?.scrollHomeToTop() });
      return;
    }
    goHome(router, { after: () => setTimeout(() => tour?.scrollHomeToTop(), 80) });
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
          const addressBar =
            Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.href : null;
          if (
            pathRef.current !== '/feed' &&
            shouldResetToHomeOnLaunch({
              pathname: launchPath.current,
              initialUrl: addressBar || linkingUrl || initialUrl,
              platform: Platform.OS,
            })
          ) {
            clearLastOpenChallenge();
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
    stopMediaUnlessCameraPath(pathname);
  }, [pathname]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const previous = appState.current;
      if (next !== 'active') {
        stopAllLiveMedia();
      }
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
        clearLastOpenChallenge();
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

  function onAction(id: QuickActionId | LogoMenuAction, challenge?: LoggableChallenge) {
    if (id === 'log') {
      if (challenge?.id) {
        closeOverlays();
        pushCheckinSubmit(router, challenge.id, 'plus-checkin', undefined, pathname);
        return;
      }
      const list = loggable.data ?? [];
      if (list.length >= 2) {
        go(MULTI_CHECKIN_HREF);
        return;
      }
      if (list.length === 1 && list[0]?.id) {
        closeOverlays();
        pushCheckinSubmit(router, list[0].id, 'plus-checkin', undefined, pathname);
        return;
      }
      // Nothing loggable explains itself on the hub. Never a silent close, never the Wave camera.
      go(MULTI_CHECKIN_HREF);
      return;
    }
    if (id === 'create') {
      const root = (segments as string[]).filter((segment) => !segment.startsWith('('))[0];
      go(root === 'feed' ? '/challenges/create?returnTo=feed' : '/challenges/create');
      return;
    }
    if (id === 'createCircle') {
      go(CIRCLES_CREATE_HREF);
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
      startFreshRoundCapture(router);
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
  const watchOpen = isWatchSurfacePath(pathname);

  return (
    <MediaLightboxHost>
    <View className="flex-1" style={{ backgroundColor: THEME.background }}>
      {watchOpen || isChallengeIdRoute(segments as string[]) || isCircleIdRoute(segments as string[]) || pathname.includes('/capture') ? null : (
        <TabChromeHeader
          alertsOpen={alertsOpen}
          searchOpen={searchOpen}
          logoMenuOpen={logoMenuOpen}
          messagesOpen={messagesOpen}
          onToggleAlerts={toggleAlerts}
          onToggleSearch={toggleSearch}
          onToggleLogoMenu={toggleLogoMenu}
          onToggleMessages={toggleMessages}
          onHomePress={onHomePress}
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
          <Tabs.Screen name="circles" options={{ href: null, title: 'Circles' }} />
          <Tabs.Screen name="notifications" options={{ href: null, title: 'Alerts' }} />
          <Tabs.Screen name="messages" options={{ title: 'Messages' }} />
          <Tabs.Screen name="capture" options={{ href: null, title: 'Capture' }} />
          <Tabs.Screen name="checkin" options={{ href: null, title: 'Multi Check-In' }} />
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
        {onOnboarding ? null : <InterestsHomeHost />}
        {onOnboarding ? null : <OfficialPitchHost />}
        </SocialSheetsHost>
        </InviteHost>
      </View>
      {watchOpen || onOnboarding || isLiveCameraPath(pathname) ? null : (
        <BlobTabBar
          composeOpen={sheetOpen}
          onToggleCompose={toggleSheet}
          onTabPress={closeOverlays}
        />
      )}
      <View
        pointerEvents={sheetOpen ? 'auto' : 'none'}
        style={styles.sheetLayer}>
        <PlusActionBar
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
