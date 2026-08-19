import { useCallback, useEffect, useRef, useState } from 'react';
import { Tabs, useRouter, useSegments, type Href } from 'expo-router';
import { View } from 'react-native';

import { BlobTabBar } from '@/components/navigation/BlobTabBar';
import { QuickActionSheet, type QuickActionId } from '@/components/navigation/QuickActionSheet';
import { AlertsOverlay } from '@/components/notifications/AlertsOverlay';
import { SearchOverlay } from '@/components/search/SearchOverlay';
import { closeSocialSheets, SocialSheetsHost } from '@/components/social/SocialSheets';
import { TourHost } from '@/components/tour/TourHost';
import { TourProvider, useTour } from '@/components/tour/TourContext';
import { TabChromeHeader, isAlertsTab, isChallengeIdRoute } from '@/components/wallet/TabChrome';
import { WalletHost } from '@/components/wallet/WalletHost';
import { useLoggableChallenge } from '@/hooks/useLoggableChallenge';
import { useNotificationsRealtime } from '@/hooks/useNotifications';
import { HealthLogPromptHost } from '@/components/health/HealthLogPrompt';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useMyProfile } from '@/hooks/useProfile';
import { useTickUserGrants } from '@/hooks/useUserGrants';
import { useWalletOptional } from '@/hooks/useWallet';
import { CAPTURE_REEL_HREF, CAPTURE_STORY_HREF, LOBBY_HREF } from '@/lib/routes';
import { THEME } from '@/lib/theme';

export default function TabLayout() {
  return (
    <TourProvider>
      <TabLayoutInner />
    </TourProvider>
  );
}

function FirstRunTourLauncher() {
  const { profile } = useMyProfile();
  const tour = useTour();
  const router = useRouter();
  const started = useRef(false);
  const start = tour.start;
  const active = tour.active;

  useEffect(() => {
    if (active || !profile || profile.tutorial_completed_at) {
      return;
    }
    router.navigate('/feed');
    const handle = setTimeout(() => {
      if (started.current) {
        return;
      }
      started.current = true;
      start();
    }, 450);
    return () => clearTimeout(handle);
  }, [active, profile?.id, profile?.tutorial_completed_at, router, start]);

  return null;
}

function TabLayoutInner() {
  const router = useRouter();
  const segments = useSegments();
  const wallet = useWalletOptional();
  const { profile, refetch } = useMyProfile();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const loggable = useLoggableChallenge();
  useNotificationsRealtime();
  usePushNotifications();
  useTickUserGrants(true);

  const closeOverlays = useCallback(() => {
    setAlertsOpen(false);
    setSearchOpen(false);
    setSheetOpen(false);
    closeSocialSheets();
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
    closeSocialSheets();
    wallet?.closeAll();
    setSheetOpen(true);
  }

  function go(href: Href) {
    closeOverlays();
    setTimeout(() => router.push(href), 60);
  }

  function onAction(id: QuickActionId) {
    if (id === 'log' && loggable.data?.id) {
      go(`/challenges/${loggable.data.id}/submit`);
      return;
    }
    if (id === 'create') {
      go('/challenges/create');
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
      // Action id stays `story`; capture URL stays mode=story. User-facing name is Wave.
      go(CAPTURE_STORY_HREF);
      return;
    }
    if (id === 'reel') {
      // Action id stays `reel`; capture URL stays mode=reel. User-facing name is Round.
      go(CAPTURE_REEL_HREF);
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

  return (
    <View className="flex-1" style={{ backgroundColor: THEME.background }}>
      {isChallengeIdRoute(segments as string[]) ? null : (
        <TabChromeHeader
          alertsOpen={alertsOpen}
          searchOpen={searchOpen}
          onToggleAlerts={toggleAlerts}
          onToggleSearch={toggleSearch}
        />
      )}
      <View className="flex-1" style={{ overflow: 'hidden' }}>
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
          <Tabs.Screen name="friends" options={{ title: 'Friends' }} listeners={{ tabPress: closeOverlays }} />
          <Tabs.Screen name="notifications" options={{ href: null, title: 'Alerts' }} />
          <Tabs.Screen name="messages" options={{ href: null, title: 'Messages' }} />
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
        <QuickActionSheet
          visible={sheetOpen}
          loggable={loggable.data}
          onClose={() => setSheetOpen(false)}
          onAction={onAction}
        />
        <WalletHost />
        <HealthLogPromptHost />
        </SocialSheetsHost>
      </View>
      <BlobTabBar
        composeOpen={sheetOpen}
        onToggleCompose={toggleSheet}
        onTabPress={closeOverlays}
      />
      {profile && !profile.tutorial_completed_at ? <FirstRunTourLauncher /> : null}
      <TourHost onFinished={() => void refetch()} />
    </View>
  );
}
