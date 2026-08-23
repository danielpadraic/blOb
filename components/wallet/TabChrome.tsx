import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';

import { BlobMascot } from '@/components/mascot/BlobMascot';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { TourAnchor } from '@/components/tour/TourAnchor';
import { WalletBar } from '@/components/wallet/WalletBar';
import { useUnreadNotificationCount } from '@/hooks/useNotifications';
import { useConversations } from '@/hooks/useSocial';
import { useWalletOptional } from '@/hooks/useWallet';
import { MESSAGES_HREF } from '@/lib/routes';
import { THEME, themeShadow } from '@/lib/theme';

export type LogoMenuAction = 'create' | 'callout' | 'join' | 'coins';

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

/** Nested `/challenges/[id]` (and submit), not lobby/create/callout/profile. */
export function isChallengeIdRoute(segments: string[]): boolean {
  const parts = segments.filter((segment) => !segment.startsWith('('));
  if (parts[0] !== 'challenges' || !parts[1]) {
    return false;
  }
  const nested = parts[1];
  return nested !== 'index' && nested !== 'create' && nested !== 'callout' && nested !== 'u';
}

type TabChromeHeaderProps = {
  alertsOpen?: boolean;
  searchOpen?: boolean;
  logoMenuOpen?: boolean;
  onToggleAlerts?: () => void;
  onToggleSearch?: () => void;
  onToggleLogoMenu?: () => void;
  onLogoAction?: (id: LogoMenuAction) => void;
};

const LOGO_MENU: { id: LogoMenuAction; label: string }[] = [
  { id: 'create', label: 'Create a Challenge' },
  { id: 'callout', label: 'Call someone out' },
  { id: 'join', label: 'Join a Challenge' },
  { id: 'coins', label: 'Send Coins or $' },
];

export function TabChromeHeader({
  alertsOpen = false,
  searchOpen = false,
  logoMenuOpen = false,
  onToggleAlerts,
  onToggleSearch,
  onToggleLogoMenu,
  onLogoAction,
}: TabChromeHeaderProps) {
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
        overflow: 'visible',
      }}>
      {logoMenuOpen ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close menu"
          onPress={onToggleLogoMenu}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: -900,
            left: 0,
            zIndex: 1,
          }}
        />
      ) : null}
      <View className="flex-row items-center px-4 pb-2.5 pt-2" style={{ zIndex: 2 }}>
          <View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={logoMenuOpen ? 'Close blOb menu' : 'Open blOb menu'}
              accessibilityState={{ expanded: logoMenuOpen }}
              onPress={onToggleLogoMenu}
              hitSlop={8}
              style={{ borderRadius: 8 }}>
              <BlobMascot variant="logo" size={56} />
            </Pressable>
            {logoMenuOpen ? (
              <View
                style={{
                  position: 'absolute',
                  top: 52,
                  left: 0,
                  width: 228,
                  backgroundColor: THEME.surface,
                  borderRadius: THEME.radius,
                  borderWidth: 1,
                  borderColor: THEME.border,
                  overflow: 'hidden',
                  zIndex: 3,
                  ...themeShadow('card'),
                }}>
                {LOGO_MENU.map((row, index) => (
                  <Pressable
                    key={row.id}
                    accessibilityRole="button"
                    accessibilityLabel={row.label}
                    onPress={() => onLogoAction?.(row.id)}
                    className="justify-center px-4"
                    style={{
                      minHeight: 44,
                      borderTopWidth: index === 0 ? 0 : 1,
                      borderTopColor: THEME.border,
                    }}>
                    <AppText className="text-[14px] font-semibold text-charcoal">{row.label}</AppText>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
          <TourAnchor id="tour-search">
            <HeaderIcon
              label={searchOpen ? 'Close search' : 'Search'}
              active={searchOpen}
              onPress={onToggleSearch}>
              <Glyph name={GLYPH.search} color={searchOpen ? THEME.accent : THEME.textPrimary} size={20} />
            </HeaderIcon>
          </TourAnchor>
          <View className="flex-1" />
          <WalletBar />
          <TourAnchor id="tour-dm">
            <HeaderIcon
              label={unreadMessages > 0 ? `Messages, ${unreadMessages} unread` : 'Messages'}
              onPress={() => {
                wallet?.closeAll();
                router.push(MESSAGES_HREF);
              }}>
              <Glyph name={GLYPH.reply} color={THEME.textPrimary} size={20} />
              {unreadMessages > 0 ? <UnreadDot count={unreadMessages} /> : null}
            </HeaderIcon>
          </TourAnchor>
          <TourAnchor id="tour-bell">
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
          </TourAnchor>
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
