import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

import { BlobMascot } from '@/components/mascot/BlobMascot';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { WalletBar } from '@/components/wallet/WalletBar';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { useConversations } from '@/hooks/useSocial';
import { useWalletOptional } from '@/hooks/useWallet';
import { MESSAGES_HREF } from '@/lib/routes';
import { THEME } from '@/lib/theme';

export const TAB_ROOT_EDGES: Edge[] = ['left', 'right'];

const TAB_CHROME_ROOTS = new Set([
  'feed',
  'challenges',
  'friends',
  'notifications',
  'profile',
  'messages',
  'capture',
]);

export function isInsideTabChrome(segments: string[]): boolean {
  const parts = segments.filter((segment) => !segment.startsWith('('));
  return TAB_CHROME_ROOTS.has(parts[0] ?? '');
}

export function isMainTabRoute(segments: string[]): boolean {
  const parts = segments.filter((segment) => !segment.startsWith('('));
  if (parts.length === 0) {
    return false;
  }
  const [root, nested] = parts;
  if (!TAB_CHROME_ROOTS.has(root) || root === 'messages' || root === 'capture') {
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
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const wallet = useWalletOptional();
  const unread = useUnreadNotificationCount();
  const conversations = useConversations();
  const unreadCount = unread.data ?? 0;
  const unreadMessages = (conversations.data ?? []).filter((row) => row.unread).length;

  return (
    <View
      style={{
        zIndex: 50,
        elevation: 50,
        backgroundColor: THEME.background,
        paddingTop: insets.top,
        borderBottomWidth: 1,
        borderBottomColor: THEME.border,
      }}>
      <View className="flex-row items-center px-4 pb-2.5 pt-2">
        <BlobMascot variant="logo" size={56} />
        <View className="flex-1" />
        <WalletBar />
        <HeaderIcon
          label={unreadMessages > 0 ? `Messages, ${unreadMessages} unread` : 'Messages'}
          onPress={() => {
            wallet?.closeAll();
            router.push(MESSAGES_HREF);
          }}>
          <Glyph name={GLYPH.reply} color={THEME.textPrimary} size={20} />
          {unreadMessages > 0 ? <UnreadDot count={unreadMessages} /> : null}
        </HeaderIcon>
        <HeaderIcon
          label={
            alertsOpen
              ? 'Close alerts'
              : unreadCount > 0
                ? `Alerts, ${unreadCount} unread`
                : 'Alerts'
          }
          active={alertsOpen}
          onPress={onToggleAlerts}>
          <Glyph name={GLYPH.bell} color={alertsOpen ? THEME.accent : THEME.textPrimary} size={20} />
          {unreadCount > 0 ? <UnreadDot count={unreadCount} /> : null}
        </HeaderIcon>
      </View>
    </View>
  );
}

function HeaderIcon({
  label,
  active,
  onPress,
  children,
}: {
  label: string;
  active?: boolean;
  onPress?: () => void;
  children: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: Boolean(active) }}
      onPress={onPress}
      hitSlop={8}
      className="ml-2 h-9 w-9 items-center justify-center"
      style={{
        borderRadius: 12,
        backgroundColor: THEME.surface,
        borderWidth: 1,
        borderColor: active ? THEME.accent : THEME.border,
      }}>
      {children}
    </Pressable>
  );
}

function UnreadDot({ count }: { count: number }) {
  return (
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
        {count > 99 ? '99+' : count}
      </AppText>
    </View>
  );
}
