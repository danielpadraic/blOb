import { useCallback, useState } from 'react';
import { Tabs, useRouter, useSegments, type Href } from 'expo-router';
import { View } from 'react-native';

import { BlobTabBar } from '@/components/navigation/BlobTabBar';
import { QuickActionSheet, type QuickActionId } from '@/components/navigation/QuickActionSheet';
import { AlertsOverlay } from '@/components/notifications/AlertsOverlay';
import { SearchOverlay } from '@/components/search/SearchOverlay';
import { closeSocialSheets, SocialSheetsHost } from '@/components/social/SocialSheets';
import { TabChromeHeader, isAlertsTab } from '@/components/wallet/TabChrome';
import { WalletHost } from '@/components/wallet/WalletHost';
import { useLoggableChallenge } from '@/hooks/useLoggableChallenge';
import { useNotificationsRealtime } from '@/hooks/useNotifications';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useWalletOptional } from '@/hooks/useWallet';
import { CAPTURE_REEL_HREF, CAPTURE_STORY_HREF, LOBBY_HREF } from '@/lib/routes';
import { THEME } from '@/lib/theme';

export default function TabLayout() {
  const router = useRouter();
  const segments = useSegments();
  const wallet = useWalletOptional();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const loggable = useLoggableChallenge();
  useNotificationsRealtime();
  usePushNotifications();

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

  function openSheet() {
    closeOverlays();
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
      <TabChromeHeader
        alertsOpen={alertsOpen}
        searchOpen={searchOpen}
        onToggleAlerts={toggleAlerts}
        onToggleSearch={toggleSearch}
      />
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
        </SocialSheetsHost>
      </View>
      <BlobTabBar onOpenCompose={openSheet} onTabPress={closeOverlays} />
    </View>
  );
}
