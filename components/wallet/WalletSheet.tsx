import { useEffect, useMemo, useRef, useState } from 'react';
import { BackHandler, PanResponder, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SendWalletButton, WalletBalances } from '@/components/currency/WalletBalances';
import { WalletHistory } from '@/components/wallet/WalletHistory';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { useMyProfile } from '@/hooks/useProfile';
import { useWallet } from '@/hooks/useWallet';
import { useGeoCashOptional } from '@/components/geo/GeoCashHost';
import { copy } from '@/lib/copy';
import { hasPayoutAddress } from '@/lib/payoutAddress';
import { tabBarLift, THEME } from '@/lib/theme';

const EARN_WAYS = [
  { icon: GLYPH.check, title: copy('wallet.finishChallenges'), body: copy('wallet.finishChallengesBody') },
  { icon: GLYPH.star, title: 'Unlock badges', body: 'Milestones grant bonus Coins.' },
  { icon: GLYPH.streak, title: 'Check in your days', body: 'Proofs stack toward streak badges.' },
  { icon: GLYPH.flag, title: 'Host a challenge', body: 'Create one and earn the Host title.' },
  { icon: GLYPH.swords, title: 'Win a call-out', body: '1-on-1 prizes pay in the stake currency.' },
] as const;

export function WalletSheet() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile } = useMyProfile();
  const { sheetOpen, scrollToLatest, closeWallet, openSend, openTopUp } = useWallet();
  const geo = useGeoCashOptional();
  const scrollRef = useRef<ScrollView>(null);
  const receiptsY = useRef(0);
  const [cashOutNote, setCashOutNote] = useState<string | null>(null);
  const tabLift = tabBarLift(insets.bottom, 'overlay');

  useEffect(() => {
    if (!sheetOpen || !scrollToLatest) {
      return;
    }
    const timer = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(receiptsY.current - 8, 0), animated: true });
    }, 80);
    return () => clearTimeout(timer);
  }, [scrollToLatest, sheetOpen]);

  useEffect(() => {
    if (!sheetOpen) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      closeWallet();
      return true;
    });
    return () => sub.remove();
  }, [closeWallet, sheetOpen]);

  const swipe = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) =>
          gesture.dy > 8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dy > 56 || gesture.vy > 0.85) {
            closeWallet();
          }
        },
      }),
    [closeWallet],
  );

  if (!profile || !sheetOpen) {
    return null;
  }

  function go(path: '/challenges' | '/challenges/create' | '/feed') {
    closeWallet();
    setTimeout(() => router.push(path), 60);
  }

  return (
    <ChromeOverlay visible onClose={closeWallet} insetBottom={tabLift}>
      <View
        className="max-h-[88%] px-5 pt-3"
        style={{
          backgroundColor: THEME.background,
          borderTopLeftRadius: THEME.radiusLg,
          borderTopRightRadius: THEME.radiusLg,
          paddingBottom: 12,
        }}>
          <View {...swipe.panHandlers}>
            <View className="items-center pb-1">
              <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
            </View>
            <View className="mb-2 flex-row items-center" style={{ minHeight: 44 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
                onPress={closeWallet}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Glyph name={GLYPH.close} color={THEME.textPrimary} size={16} />
              </Pressable>
              <AppText className="flex-1 text-center text-lg font-bold text-charcoal">Wallet</AppText>
              <View style={{ width: 44, height: 44 }} />
            </View>
          </View>

          <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}>
            <WalletBalances profile={profile} />
            <View
              onLayout={(event) => {
                receiptsY.current = event.nativeEvent.layout.y;
              }}>
              <WalletHistory />
            </View>

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
              <Button
                title="Cash out"
                variant="outline"
                loading={geo?.busy}
                onPress={() => {
                  setCashOutNote(null);
                  void (async () => {
                    const allowed = geo ? await geo.ensure({ action: 'cashout' }) : false;
                    if (!allowed) {
                      return;
                    }
                    setCashOutNote(copy('geo.cashOutSoon'));
                  })();
                }}
              />
              {!hasPayoutAddress(profile) ? (
                <AppText className="text-[13px] leading-5 text-muted">
                  {copy('wallet.addAddressToCashOut')}
                </AppText>
              ) : null}
              {cashOutNote ? (
                <AppText className="text-[13px] leading-5 text-muted">{cashOutNote}</AppText>
              ) : null}
              <Button title="Browse challenges" onPress={() => go('/challenges')} />
              <SendWalletButton
                onPress={() => {
                  closeWallet();
                  openSend();
                }}
              />
            </View>
          </ScrollView>
      </View>
    </ChromeOverlay>
  );
}
