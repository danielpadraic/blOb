import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { usePathname, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComposeTabButton } from '@/components/navigation/ComposeTabButton';
import { TourAnchor } from '@/components/tour/TourAnchor';
import { useTourOptional } from '@/components/tour/TourContext';
import { Avatar } from '@/components/ui/Avatar';
import { useMyProfile } from '@/hooks/useProfile';
import { LOBBY_HREF } from '@/lib/routes';
import { personDisplayName } from '@/lib/social';
import { THEME, themeShadow } from '@/lib/theme';

const HIT = 44;

type BlobTabBarProps = {
  composeOpen?: boolean;
  onToggleCompose: () => void;
  onTabPress?: () => void;
};

export function BlobTabBar({ composeOpen = false, onToggleCompose, onTabPress }: BlobTabBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const tour = useTourOptional();
  const tourLocked = Boolean(tour?.active);
  const tabBottom = Math.max(insets.bottom, 10);
  const active = activeTab(pathname);

  function go(href: '/feed' | typeof LOBBY_HREF | '/friends' | '/profile') {
    onTabPress?.();
    if (href === LOBBY_HREF) {
      if (pathname === LOBBY_HREF || pathname === `${LOBBY_HREF}/`) {
        return;
      }
      if (pathname.startsWith(`${LOBBY_HREF}/`)) {
        router.dismissTo(LOBBY_HREF);
        return;
      }
      router.navigate(LOBBY_HREF);
      return;
    }
    if (href === '/profile') {
      if (pathname === '/profile' || pathname === '/profile/') {
        return;
      }
      if (pathname.startsWith('/profile/')) {
        router.dismissTo('/profile');
        return;
      }
      router.navigate('/profile');
      return;
    }
    router.navigate(href);
  }

  return (
    <View
      pointerEvents="box-none"
      style={{
        paddingHorizontal: 10,
        paddingBottom: tabBottom,
        paddingTop: 18,
        marginTop: -18,
        backgroundColor: 'transparent',
        zIndex: 80,
        elevation: 80,
      }}>
      <View
        pointerEvents={tourLocked ? 'none' : 'auto'}
        className="flex-row items-center"
        style={{
          height: 70,
          backgroundColor: 'rgba(255,255,255,0.94)',
          borderWidth: 1,
          borderColor: THEME.border,
          borderRadius: 23,
          paddingTop: 8,
          paddingBottom: 8,
          overflow: 'visible',
          ...themeShadow('bar'),
        }}>
        <TourAnchor id="tour-tab-feed" style={{ flex: 1 }}>
          <TabSlot
            label="Home"
            selected={active === 'feed'}
            icon={{ ios: 'house.fill', android: 'home', web: 'home' }}
            onPress={() => go('/feed')}
          />
        </TourAnchor>
        <TourAnchor id="tour-tab-lobby" style={{ flex: 1 }}>
          <TabSlot
            label="Lobby"
            selected={active === 'challenges'}
            icon={{ ios: 'flag.fill', android: 'flag', web: 'flag' }}
            onPress={() => go(LOBBY_HREF)}
          />
        </TourAnchor>
        <View style={{ flex: 1, minWidth: 0, overflow: 'visible', zIndex: 90 }}>
          <ComposeTabButton open={composeOpen} onPress={onToggleCompose} />
        </View>
        <TourAnchor id="tour-tab-friends" style={{ flex: 1 }}>
          <TabSlot
            label="Friends"
            selected={active === 'friends'}
            icon={{ ios: 'person.2.fill', android: 'group', web: 'group' }}
            onPress={() => go('/friends')}
          />
        </TourAnchor>
        <TourAnchor id="tour-tab-you" style={{ flex: 1 }}>
          <YouTabSlot selected={active === 'profile'} onPress={() => go('/profile')} />
        </TourAnchor>
      </View>
    </View>
  );
}

function TabSlot({
  label,
  selected,
  icon,
  onPress,
}: {
  label: string;
  selected: boolean;
  icon: NonNullable<SymbolViewProps['name']>;
  onPress: () => void;
}) {
  const color = selected ? THEME.accent : THEME.textMuted;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={4}
      style={{
        width: '100%',
        minWidth: HIT,
        minHeight: HIT,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <SymbolView name={icon} tintColor={color} size={26} />
    </Pressable>
  );
}

function YouTabSlot({ selected, onPress }: { selected: boolean; onPress: () => void }) {
  const { profile } = useMyProfile();
  const name = profile ? personDisplayName(profile) : 'You';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel="You"
      onPress={onPress}
      hitSlop={4}
      style={{
        width: '100%',
        minWidth: HIT,
        minHeight: HIT,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <View
        style={{
          padding: 2,
          borderRadius: 999,
          borderWidth: 2,
          borderColor: selected ? THEME.accent : 'transparent',
        }}>
        <Avatar uri={profile?.avatar_url} name={name} size={28} />
      </View>
    </Pressable>
  );
}

function activeTab(pathname: string): 'feed' | 'challenges' | 'friends' | 'profile' | null {
  if (pathname.startsWith('/feed')) {
    return 'feed';
  }
  if (pathname.startsWith('/challenges')) {
    return 'challenges';
  }
  if (pathname.startsWith('/friends')) {
    return 'friends';
  }
  if (pathname.startsWith('/profile')) {
    return 'profile';
  }
  return null;
}
