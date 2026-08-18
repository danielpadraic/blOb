import { Pressable, View } from 'react-native';
import { useSegments } from 'expo-router';
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

import { BlobMascot } from '@/components/mascot/BlobMascot';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { WalletBar } from '@/components/wallet/WalletBar';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { THEME } from '@/lib/theme';

export const TAB_ROOT_EDGES: Edge[] = ['left', 'right'];

const MAIN_TABS = new Set(['feed', 'challenges', 'friends', 'notifications', 'profile']);

export function isMainTabRoute(segments: string[]): boolean {
  const parts = segments.filter((segment) => !segment.startsWith('('));
  if (parts.length === 0) {
    return false;
  }
  const [root, nested] = parts;
  if (!MAIN_TABS.has(root)) {
    return false;
  }
  return !nested || nested === 'index';
}

export function isAlertsTab(segments: string[]): boolean {
  const parts = segments.filter((segment) => !segment.startsWith('('));
  return parts[0] === 'notifications' && (!parts[1] || parts[1] === 'index');
}

export function isLobbyListRoute(segments: string[]): boolean {
  const parts = segments.filter((segment) => !segment.startsWith('('));
  return parts[0] === 'challenges' && (!parts[1] || parts[1] === 'index');
}

type TabChromeHeaderProps = {
  alertsOpen?: boolean;
  onToggleAlerts?: () => void;
};

export function TabChromeHeader({ alertsOpen = false, onToggleAlerts }: TabChromeHeaderProps) {
  const segments = useSegments();
  const insets = useSafeAreaInsets();
  const unread = useUnreadNotificationCount();
  const visible = isMainTabRoute(segments);
  const unreadCount = unread.data ?? 0;

  return (
    <View
      pointerEvents={visible ? 'auto' : 'none'}
      style={{
        zIndex: 50,
        elevation: 50,
        backgroundColor: THEME.background,
        paddingTop: visible ? insets.top : 0,
        maxHeight: visible ? undefined : 0,
        overflow: 'hidden',
        borderBottomWidth: visible ? 1 : 0,
        borderBottomColor: THEME.border,
      }}>
      <View className="flex-row items-center px-4 pb-2.5 pt-2">
        <BlobMascot variant="logo" size={56} />
        <View className="flex-1" />
        <WalletBar />
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: alertsOpen }}
          accessibilityLabel={
            alertsOpen
              ? 'Close alerts'
              : unreadCount > 0
                ? `Alerts, ${unreadCount} unread`
                : 'Alerts'
          }
          onPress={onToggleAlerts}
          hitSlop={8}
          className="ml-2 h-9 w-9 items-center justify-center"
          style={{
            borderRadius: 12,
            backgroundColor: alertsOpen ? THEME.surface : THEME.surface,
            borderWidth: 1,
            borderColor: alertsOpen ? THEME.accent : THEME.border,
          }}>
          <Glyph name={GLYPH.bell} color={alertsOpen ? THEME.accent : THEME.textPrimary} size={20} />
          {unreadCount > 0 ? (
            <View
              className="absolute items-center justify-center"
              style={{
                top: -2,
                right: -2,
                minWidth: 16,
                height: 16,
                paddingHorizontal: 3,
                borderRadius: 999,
                backgroundColor: THEME.accent,
                borderWidth: 2,
                borderColor: THEME.background,
              }}>
              <AppText className="text-[8px] font-extrabold" style={{ color: '#fff' }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </AppText>
            </View>
          ) : null}
        </Pressable>
      </View>
    </View>
  );
}
