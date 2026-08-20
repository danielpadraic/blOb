import { ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { SendWalletButton, WalletBalances } from '@/components/currency/WalletBalances';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { useMyProfile } from '@/hooks/useProfile';
import { useWallet } from '@/hooks/useWallet';
import { copy } from '@/lib/copy';
import { THEME } from '@/lib/theme';

const EARN_WAYS = [
  { icon: GLYPH.check, title: copy('wallet.finishChallenges'), body: copy('wallet.finishChallengesBody') },
  { icon: GLYPH.star, title: 'Unlock badges', body: 'Milestones grant bonus Coins.' },
  { icon: GLYPH.streak, title: 'Log your days', body: 'Proofs stack toward streak badges.' },
  { icon: GLYPH.flag, title: 'Host a challenge', body: 'Create one and earn the Host title.' },
  { icon: GLYPH.swords, title: 'Win a call-out', body: '1-on-1 prizes pay in the stake currency.' },
] as const;

export function WalletSheet() {
  const router = useRouter();
  const { profile } = useMyProfile();
  const { sheetOpen, closeWallet, openSend, openTopUp } = useWallet();

  if (!profile || !sheetOpen) {
    return null;
  }

  function go(path: '/challenges' | '/challenges/create' | '/feed') {
    closeWallet();
    setTimeout(() => router.push(path), 60);
  }

  return (
    <ChromeOverlay visible onClose={closeWallet}>
      <View
        className="max-h-[88%] px-5 pt-4"
        style={{
          backgroundColor: THEME.background,
          borderTopLeftRadius: THEME.radiusLg,
          borderTopRightRadius: THEME.radiusLg,
          paddingBottom: 16,
        }}>
          <View className="mb-3 items-center">
            <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
            <AppText className="mt-3 text-lg font-bold text-charcoal">Wallet</AppText>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <WalletBalances profile={profile} />

            <AppText className="mt-5 text-[13px] leading-5 text-muted">
              {copy('money.realUsd')}
            </AppText>

            <AppText className="mt-6 text-[12px] font-bold uppercase tracking-widest text-charcoal">
              Earn more Coins
            </AppText>
            <View className="mt-2 gap-2">
              {EARN_WAYS.map((item) => (
                <Card key={item.title} className="flex-row items-center gap-3 py-3">
                  <View
                    className="h-9 w-9 items-center justify-center rounded-full"
                    style={{ backgroundColor: THEME.accentSoft }}>
                    <Glyph name={item.icon} color={THEME.primary} size={16} />
                  </View>
                  <View className="flex-1">
                    <AppText className="text-[14px] font-bold text-charcoal">{item.title}</AppText>
                    <AppText className="text-[12px] leading-4 text-muted">{item.body}</AppText>
                  </View>
                </Card>
              ))}
            </View>

            <View className="mt-4 gap-2">
              <Button
                title="Add $1.00"
                onPress={() => {
                  closeWallet();
                  openTopUp({ amount: 1 });
                }}
              />
              <Button title="Browse challenges" onPress={() => go('/challenges')} />
              <SendWalletButton
                onPress={() => {
                  closeWallet();
                  openSend();
                }}
              />
              <Button title="Close" variant="ghost" onPress={closeWallet} />
            </View>
          </ScrollView>
      </View>
    </ChromeOverlay>
  );
}
