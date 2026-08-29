import { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';

import { TourAnchor } from '@/components/tour/TourAnchor';
import { useTourOptional } from '@/components/tour/TourContext';
import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { AppText } from '@/components/ui/AppText';
import { useMyProfile } from '@/hooks/useProfile';
import { useWalletOptional } from '@/hooks/useWallet';
import { supabase } from '@/lib/supabase';
import { copy } from '@/lib/copy';
import { formatCash } from '@/lib/currency';
import { headerCoinsForTour } from '@/lib/homeTour';
import { isOfficialAccount } from '@/lib/official';
import { countUpValues } from '@/lib/topup';
import { THEME } from '@/lib/theme';
import { formatCoins } from '@/utils/format';

export function WalletBar({ compact = false }: { compact?: boolean }) {
  const { profile } = useMyProfile();
  const wallet = useWalletOptional();
  const tour = useTourOptional();
  const tourLocked = Boolean(tour?.active);
  const queryClient = useQueryClient();
  const official = isOfficialAccount(profile);
  const coins = headerCoinsForTour(profile);
  const bucks = Number(profile?.bucks ?? 0);
  const lastShownCoins = Number(profile?.last_shown_coin_balance ?? coins);
  const lastShownBucks = Number(profile?.last_shown_bucks_balance ?? bucks);
  const [displayCoins, setDisplayCoins] = useState(coins);
  const [displayBucks, setDisplayBucks] = useState(bucks);
  const animatingCoins = useRef(false);
  const animatingBucks = useRef(false);
  const shownCoins = useRef<number | null>(null);
  const shownBucks = useRef<number | null>(null);

  useEffect(() => {
    if (!profile || official) {
      return;
    }
    if (tourLocked || !profile.tutorial_completed_at) {
      setDisplayCoins(coins);
      shownCoins.current = coins;
      return;
    }
    if (coins <= lastShownCoins) {
      setDisplayCoins(coins);
      shownCoins.current = coins;
      if (coins < lastShownCoins) {
        void markCoinsShown();
      }
      return;
    }
    if (!animatingCoins.current) {
      setDisplayCoins(lastShownCoins);
    }
  }, [coins, lastShownCoins, official, profile?.id, profile?.tutorial_completed_at, tourLocked]);

  useEffect(() => {
    if (!profile || official) {
      return;
    }
    if (shownBucks.current === bucks || bucks <= lastShownBucks) {
      setDisplayBucks(bucks);
      shownBucks.current = bucks;
      if (bucks < lastShownBucks) {
        void markBucksShown();
      }
      return;
    }
    if (!animatingBucks.current) {
      void runCount(
        lastShownBucks,
        bucks,
        setDisplayBucks,
        animatingBucks,
        shownBucks,
        markBucksShown,
      );
    }
  }, [bucks, lastShownBucks, official, profile?.id]);

  useEffect(() => {
    function countCoinsIfRose() {
      if (official || tourLocked || !profile?.tutorial_completed_at) {
        return;
      }
      if (coins > lastShownCoins && !animatingCoins.current) {
        void runCount(
          lastShownCoins,
          coins,
          setDisplayCoins,
          animatingCoins,
          shownCoins,
          markCoinsShown,
        );
      }
    }

    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        return;
      }
      countCoinsIfRose();
      if (official) {
        return;
      }
      if (bucks > lastShownBucks && !animatingBucks.current) {
        void runCount(
          lastShownBucks,
          bucks,
          setDisplayBucks,
          animatingBucks,
          shownBucks,
          markBucksShown,
        );
      }
    });
    function onDocumentVisible() {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') {
        return;
      }
      countCoinsIfRose();
    }
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', onDocumentVisible);
    }
    return () => {
      sub.remove();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onDocumentVisible);
      }
    };
  }, [
    bucks,
    coins,
    lastShownBucks,
    lastShownCoins,
    official,
    profile?.tutorial_completed_at,
    tourLocked,
  ]);

  async function markCoinsShown() {
    await supabase.rpc('mark_coin_balance_shown');
    void queryClient.invalidateQueries({ queryKey: ['profile'] });
  }

  async function markBucksShown() {
    await supabase.rpc('mark_bucks_balance_shown');
    void queryClient.invalidateQueries({ queryKey: ['profile'] });
  }

  if (!profile || !wallet) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open wallet"
      disabled={tourLocked}
      onPress={tourLocked ? undefined : wallet.openWallet}
      className="flex-row items-center"
      style={{
        backgroundColor: THEME.surface,
        borderColor: THEME.border,
        borderWidth: 1,
        borderRadius: 999,
        paddingVertical: compact ? 3 : 6,
        paddingHorizontal: compact ? 6 : 10,
        flexShrink: 1,
        minWidth: 0,
        alignSelf: compact ? 'center' : 'flex-start',
      }}
      hitSlop={6}>
      <TourAnchor id="tour-coins">
        <View className="flex-row items-center" style={{ minHeight: 28, minWidth: 0, flexShrink: 1 }}>
          <CurrencyMark currency="coins" size={compact ? 15 : 18} />
          <AppText
            className="ml-1 font-extrabold text-charcoal"
            numberOfLines={1}
            style={{ fontSize: 11, lineHeight: 13, fontVariant: ['tabular-nums'], minWidth: 0, flexShrink: 1 }}>
            {official
              ? copy('official.infinity')
              : compact
                ? String(Math.round(Number(displayCoins) || 0))
                : formatCoins(displayCoins).replace(' Coins', '')}
          </AppText>
        </View>
      </TourAnchor>
      <AppText className="mx-1 font-extrabold text-muted" style={{ fontSize: 11, lineHeight: 13 }}>
        ·
      </AppText>
      <TourAnchor id="tour-money">
        <View className="flex-row items-center" style={{ minHeight: 28, minWidth: 0, flexShrink: 1 }}>
          <AppText
            className="font-extrabold"
            numberOfLines={1}
            style={{
              fontSize: 11,
              lineHeight: 13,
              color: '#1B7A4A',
              fontVariant: ['tabular-nums'],
              minWidth: 0,
              flexShrink: 1,
            }}>
            {formatCash(displayBucks)}
          </AppText>
        </View>
      </TourAnchor>
    </Pressable>
  );
}

async function runCount(
  from: number,
  to: number,
  setValue: (value: number) => void,
  animating: { current: boolean },
  shownAt: { current: number | null },
  markShown: () => Promise<void>,
) {
  animating.current = true;
  for (const value of countUpValues(from, to)) {
    setValue(value);
    await sleep(24);
  }
  setValue(to);
  animating.current = false;
  shownAt.current = to;
  await markShown();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
