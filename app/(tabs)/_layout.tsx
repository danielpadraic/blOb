import { useCallback, useState } from 'react';
import { SymbolView } from 'expo-symbols';
import { Tabs, useRouter, useSegments, type Href } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComposeTabButton } from '@/components/navigation/ComposeTabButton';
import { QuickActionSheet, type QuickActionId } from '@/components/navigation/QuickActionSheet';
import { AlertsOverlay } from '@/components/notifications/AlertsOverlay';
import { TabChromeHeader, isAlertsTab, isLobbyListRoute, isMainTabRoute } from '@/components/wallet/TabChrome';
import { WalletHost } from '@/components/wallet/WalletHost';
import { useLoggableChallenge } from '@/hooks/useLoggableChallenge';
import { useNotificationsRealtime } from '@/hooks/useNotifications';
import { THEME, themeShadow } from '@/lib/theme';
import { LOBBY_HREF } from '@/lib/routes';

export default function TabLayout() {
  const router = useRouter();
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const loggable = useLoggableChallenge();
  useNotificationsRealtime();
  const tabBottom = Math.max(insets.bottom, 10);
  const hideTabBar = !isMainTabRoute(segments as string[]);

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
    setSheetOpen(false);
    setAlertsOpen(true);
  }

  function openSheet() {
    setAlertsOpen(false);
    setSheetOpen(true);
  }

  function go(href: Href) {
    setSheetOpen(false);
    setAlertsOpen(false);
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
    if (id === 'coins') {
      go('/profile/send');
      return;
    }
    if (id === 'callout') {
      go('/challenges/callout/create');
    }
  }

  return (
    <View className="flex-1" style={{ backgroundColor: THEME.background }}>
        <TabChromeHeader alertsOpen={alertsOpen} onToggleAlerts={toggleAlerts} />
        <View className="flex-1">
        <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: THEME.accent,
          tabBarInactiveTintColor: THEME.textMuted,
          tabBarStyle: hideTabBar
            ? { display: 'none' }
            : {
                position: 'absolute',
                left: 10,
                right: 10,
                bottom: tabBottom,
                height: 70,
                backgroundColor: 'rgba(255,255,255,0.94)',
                borderTopWidth: 0,
                borderWidth: 1,
                borderColor: THEME.border,
                borderRadius: 23,
                paddingTop: 8,
                paddingBottom: 8,
                overflow: 'visible',
                ...themeShadow('bar'),
              },
          tabBarItemStyle: {
            paddingTop: 2,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '700',
          },
        }}>
        <Tabs.Screen
          name="feed"
          options={{
            title: 'Feed',
            tabBarIcon: ({ color }) => (
              <SymbolView
                name={{ ios: 'text.bubble.fill', android: 'forum', web: 'forum' }}
                tintColor={color}
                size={26}
              />
            ),
          }}
          listeners={{ tabPress: closeAlerts }}
        />
        <Tabs.Screen
          name="challenges"
          options={{
            title: 'Lobby',
            href: LOBBY_HREF,
            popToTopOnBlur: true,
            tabBarIcon: ({ color }) => (
              <SymbolView
                name={{ ios: 'flag.fill', android: 'flag', web: 'flag' }}
                tintColor={color}
                size={26}
              />
            ),
          }}
          listeners={{
            tabPress: (event) => {
              closeAlerts();
              if (isLobbyListRoute(segments)) {
                return;
              }
              event.preventDefault();
              const root = segments.filter((segment) => !segment.startsWith('('))[0];
              if (root === 'challenges') {
                router.dismissTo(LOBBY_HREF);
                return;
              }
              router.navigate(LOBBY_HREF);
            },
          }}
        />
        <Tabs.Screen
          name="compose"
          options={{
            title: '',
            tabBarLabel: () => null,
            tabBarItemStyle: { overflow: 'visible' },
            tabBarButton: (props) => <ComposeTabButton style={props.style} onOpen={openSheet} />,
          }}
          listeners={{
            tabPress: (event) => {
              event.preventDefault();
              openSheet();
            },
          }}
        />
        <Tabs.Screen
          name="friends"
          options={{
            title: 'Friends',
            tabBarIcon: ({ color }) => (
              <SymbolView
                name={{ ios: 'person.2.fill', android: 'group', web: 'group' }}
                tintColor={color}
                size={26}
              />
            ),
          }}
          listeners={{ tabPress: closeAlerts }}
        />
        <Tabs.Screen
          name="notifications"
          options={{
            href: null,
            title: 'Alerts',
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'You',
            tabBarIcon: ({ color }) => (
              <SymbolView
                name={{ ios: 'person.fill', android: 'person', web: 'person' }}
                tintColor={color}
                size={26}
              />
            ),
          }}
          listeners={{ tabPress: closeAlerts }}
        />
      </Tabs>
        <AlertsOverlay visible={alertsOpen} onClose={closeAlerts} />
        </View>
      <QuickActionSheet
        visible={sheetOpen}
        loggable={loggable.data}
        onClose={() => setSheetOpen(false)}
        onAction={onAction}
      />
      <WalletHost />
    </View>
  );
}
