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
import {
  headerCountUpPlan,
  headerLastShown,
  markHeaderCountUpDone,
  type HeaderCountCurrency,
} from '@/lib/walletCountUp';
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
  const lastShownCoins = headerLastShown(profile?.last_shown_coin_balance, coins);
  const lastShownBucks = headerLastShown(profile?.last_shown_bucks_balance, bucks);
  const [displayCoins, setDisplayCoins] = useState(coins);
  const [displayBucks, setDisplayBucks] = useState(bucks);
  const animatingCoins = useRef(false);
  const animatingBucks = useRef(false);

  useEffect(() => {
    if (!profile || official || tourLocked || !profile.tutorial_completed_at) {
      setDisplayCoins(coins);
      markHeaderCountUpDone(profile?.id, 'coins', coins);
      return;
    }
    playCount('coins', lastShownCoins, coins, setDisplayCoins, animatingCoins, markCoinsShown);
  }, [coins, lastShownCoins, official, profile?.id, profile?.tutorial_completed_at, tourLocked]);

  useEffect(() => {
    if (!profile || official) {
      setDisplayBucks(bucks);
      markHeaderCountUpDone(profile?.id, 'bucks', bucks);
      return;
    }
    playCount('bucks', lastShownBucks, bucks, setDisplayBucks, animatingBucks, markBucksShown);
  }, [bucks, lastShownBucks, official, profile?.id]);

  useEffect(() => {
    function onForeground() {
      if (official || !profile?.id) {
        return;
      }
      if (!tourLocked && profile.tutorial_completed_at) {
        playCount('coins', lastShownCoins, coins, setDisplayCoins, animatingCoins, markCoinsShown);
      }
      playCount('bucks', lastShownBucks, bucks, setDisplayBucks, animatingBucks, markBucksShown);
    }
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        onForeground();
      }
    });
    function onDocumentVisible() {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        onForeground();
      }
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
    profile?.id,
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

  function playCount(
    currency: HeaderCountCurrency,
    lastShown: number,
    current: number,
    setValue: (value: number) => void,
    animating: { current: boolean },
    markShown: () => Promise<void>,
  ) {
    const plan = headerCountUpPlan({
      userId: profile?.id,
      currency,
      lastShown,
      current,
    });
    if (plan === 'snap') {
      setValue(current);
      return;
    }
    if (animating.current) {
      return;
    }
    void runCount(lastShown, current, setValue, animating, () => {
      markHeaderCountUpDone(profile?.id, currency, current);
      return markShown();
    });
  }

  if (!profile || !wallet) {
    return null;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open wallet"
      disabled={tourLocked}
      onPress={tourLocked ? undefined : () => wallet.openWallet({ scrollToLatest: true })}
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
  markShown: () => Promise<void>,
) {
  animating.current = true;
  for (const value of countUpValues(from, to)) {
    setValue(value);
    await sleep(24);
  }
  setValue(to);
  animating.current = false;
  await markShown();
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
