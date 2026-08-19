import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { TourAnchor } from '@/components/tour/TourAnchor';
import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { AppText } from '@/components/ui/AppText';
import { useMyProfile } from '@/hooks/useProfile';
import { useWalletOptional } from '@/hooks/useWallet';
import { supabase } from '@/lib/supabase';
import { copy } from '@/lib/copy';
import { isOfficialAccount } from '@/lib/official';
import { THEME } from '@/lib/theme';
import { formatCoins } from '@/utils/format';

export function WalletBar() {
  const { profile } = useMyProfile();
  const wallet = useWalletOptional();
  const queryClient = useQueryClient();
  const official = isOfficialAccount(profile);
  const coins = Number(profile?.coins ?? profile?.credits ?? 0);
  const lastShown = Number(profile?.last_shown_coin_balance ?? coins);
  const [displayCoins, setDisplayCoins] = useState(coins);
  const animating = useRef(false);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    if (!profile || official) {
      return;
    }
    if (shownAt.current === coins) {
      setDisplayCoins(coins);
      return;
    }
    if (coins < lastShown) {
      setDisplayCoins(coins);
      shownAt.current = coins;
      void markShown();
      return;
    }
    if (coins === lastShown) {
      setDisplayCoins(coins);
      shownAt.current = coins;
      return;
    }
    if (coins > lastShown && !animating.current) {
      void countUp(lastShown, coins);
    }
  }, [coins, lastShown, official, profile?.id]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (official) {
        return;
      }
      if (state === 'active' && coins > lastShown && !animating.current) {
        void countUp(lastShown, coins);
      }
    });
    return () => sub.remove();
  }, [coins, lastShown, official]);

  async function countUp(from: number, to: number) {
    animating.current = true;
    const start = Math.max(from, 0);
    const end = to;
    const steps = Math.min(24, Math.max(8, end - start));
    const step = (end - start) / steps;
    for (let i = 1; i <= steps; i += 1) {
      setDisplayCoins(Math.round(start + step * i));
      await sleep(24);
    }
    setDisplayCoins(end);
    animating.current = false;
    shownAt.current = end;
    await markShown();
  }

  async function markShown() {
    await supabase.rpc('mark_coin_balance_shown');
    void queryClient.invalidateQueries({ queryKey: ['profile'] });
  }

  if (!profile || !wallet) {
    return null;
  }

  const bucks = Number(profile.bucks ?? 0);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open wallet"
      onPress={wallet.openWallet}
      className="flex-row items-center"
      style={{
        backgroundColor: THEME.surface,
        borderColor: THEME.border,
        borderWidth: 1,
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 10,
      }}
      hitSlop={6}>
      <TourAnchor id="tour-coins">
        <View className="flex-row items-center" style={{ minHeight: 28 }}>
          <CurrencyMark currency="coins" size={18} />
          <AppText className="ml-1.5 text-[12px] font-extrabold text-charcoal">
            {official ? copy('official.infinity') : formatCoins(displayCoins).replace(' Coins', '')}
          </AppText>
        </View>
      </TourAnchor>
      <AppText className="mx-1.5 text-[12px] font-extrabold text-muted">·</AppText>
      <TourAnchor id="tour-money">
        <View className="flex-row items-center" style={{ minHeight: 28 }}>
          <AppText className="ml-1.5 text-[12px] font-extrabold" style={{ color: '#1B7A4A' }}>
            {`$${Number(bucks).toFixed(2)}`}
          </AppText>
        </View>
      </TourAnchor>
    </Pressable>
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
