import { SymbolView, type SymbolViewProps } from 'expo-symbols';
import { usePathname, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ComposeTabButton } from '@/components/navigation/ComposeTabButton';
import { AppText } from '@/components/ui/AppText';
import { LOBBY_HREF } from '@/lib/routes';
import { THEME, themeShadow } from '@/lib/theme';

type BlobTabBarProps = {
  onOpenCompose: () => void;
  onTabPress?: () => void;
};

export function BlobTabBar({ onOpenCompose, onTabPress }: BlobTabBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
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
        <TabSlot
          label="Feed"
          selected={active === 'feed'}
          icon={{ ios: 'text.bubble.fill', android: 'forum', web: 'forum' }}
          onPress={() => go('/feed')}
        />
        <TabSlot
          label="Lobby"
          selected={active === 'challenges'}
          icon={{ ios: 'flag.fill', android: 'flag', web: 'flag' }}
          onPress={() => go(LOBBY_HREF)}
        />
        <View style={{ flex: 1, minWidth: 0, overflow: 'visible' }}>
          <ComposeTabButton
            onOpen={() => {
              onTabPress?.();
              onOpenCompose();
            }}
          />
        </View>
        <TabSlot
          label="Friends"
          selected={active === 'friends'}
          icon={{ ios: 'person.2.fill', android: 'group', web: 'group' }}
          onPress={() => go('/friends')}
        />
        <TabSlot
          label="You"
          selected={active === 'profile'}
          icon={{ ios: 'person.fill', android: 'person', web: 'person' }}
          onPress={() => go('/profile')}
        />
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
      style={{ flex: 1, minWidth: 0, paddingTop: 2, alignItems: 'center', justifyContent: 'center' }}>
      <SymbolView name={icon} tintColor={color} size={26} />
      <AppText style={{ color, fontSize: 11, fontWeight: '700', marginTop: 2 }}>
        {label}
      </AppText>
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
