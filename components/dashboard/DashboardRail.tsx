import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';
import { usePathname, useRouter } from 'expo-router';

import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { useMyProfile } from '@/hooks/useProfile';
import { useWalletOptional } from '@/hooks/useWallet';
import { LOBBY_HREF } from '@/lib/routes';
import { THEME } from '@/lib/theme';

const LOGO = require('@/assets/mascot/blob-logo.png');

const LINKS = [
  { label: 'Home', href: '/feed' },
  { label: 'Lobby', href: LOBBY_HREF },
  { label: 'Dashboard', href: '/profile' },
  { label: 'Friends', href: '/friends' },
  { label: 'You', href: '/profile' },
] as const;

export function DashboardRail() {
  const router = useRouter();
  const pathname = usePathname();
  const { profile } = useMyProfile();
  const wallet = useWalletOptional();
  const name = profile?.display_name ?? profile?.username ?? 'You';

  return (
    <View
      style={{
        width: 220,
        backgroundColor: THEME.background,
        borderRightWidth: 1,
        borderRightColor: THEME.border,
        paddingTop: 24,
        paddingHorizontal: 16,
        justifyContent: 'space-between',
      }}>
      <View style={{ gap: 6 }}>
        <Image source={LOGO} style={{ width: 88, height: 32, marginBottom: 16 }} contentFit="contain" accessibilityLabel="blOb" />
        {LINKS.map((link) => {
          const on =
            link.label === 'Dashboard'
              ? pathname === '/profile' || pathname === '/profile/'
              : link.label === 'You'
                ? false
                : pathname === link.href || pathname.startsWith(`${link.href}/`);
          return (
            <Pressable
              key={link.label}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => router.navigate(link.href as never)}
              style={{
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: 10,
                backgroundColor: on ? THEME.accentSoft : 'transparent',
              }}>
              <AppText style={{ fontWeight: '700', color: on ? THEME.accent : THEME.textPrimary }}>{link.label}</AppText>
            </Pressable>
          );
        })}
        <Pressable accessibilityRole="button" onPress={() => wallet?.openWallet()} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
          <AppText style={{ fontWeight: '700', color: THEME.textPrimary }}>Wallet</AppText>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.navigate('/profile')} style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
          <AppText style={{ fontWeight: '700', color: THEME.textPrimary }}>Earnings</AppText>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => router.push('/profile/edit')}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 24 }}>
        <Avatar uri={profile?.avatar_url} name={name} size={36} />
        <View>
          <AppText style={{ fontWeight: '700', color: THEME.textPrimary }}>{name}</AppText>
          <AppText style={{ color: THEME.textMuted, fontSize: 12 }}>You · Edit profile</AppText>
        </View>
      </Pressable>
    </View>
  );
}
