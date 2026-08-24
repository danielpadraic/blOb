'use client';

import { useEffect, useRef, useState } from 'react';

import { countUpValues } from '@/lib/topup';
import { requestWebWallet } from '~/components/wallet-top-up';
import { supabase } from '~/lib/supabase';

type ProfileMoney = {
  coins: number;
  bucks: number;
  last_shown_coin_balance: number;
  last_shown_bucks_balance: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function WalletBar({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<ProfileMoney | null>(null);
  const [displayCoins, setDisplayCoins] = useState(0);
  const [displayBucks, setDisplayBucks] = useState(0);
  const animatingCoins = useRef(false);
  const animatingBucks = useRef(false);
  const shownCoins = useRef<number | null>(null);
  const shownBucks = useRef<number | null>(null);

  async function load() {
    const { data } = await supabase
      .from('profiles')
      .select('coins, bucks, last_shown_coin_balance, last_shown_bucks_balance')
      .eq('id', userId)
      .maybeSingle();
    if (!data) {
      return;
    }
    const next = {
      coins: Number((data as { coins?: number }).coins ?? 0),
      bucks: Number((data as { bucks?: number }).bucks ?? 0),
      last_shown_coin_balance: Number(
        (data as { last_shown_coin_balance?: number }).last_shown_coin_balance ??
          (data as { coins?: number }).coins ??
          0,
      ),
      last_shown_bucks_balance: Number(
        (data as { last_shown_bucks_balance?: number }).last_shown_bucks_balance ??
          (data as { bucks?: number }).bucks ??
          0,
      ),
    };
    setProfile(next);
  }

  useEffect(() => {
    void load();
    const onFocus = () => void load();
    const onRefresh = () => void load();
    window.addEventListener('focus', onFocus);
    window.addEventListener('blob-wallet-refresh', onRefresh);
    const channel = supabase
      .channel(`wallet:${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wallet_ledger', filter: `user_id=eq.${userId}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('blob-wallet-refresh', onRefresh);
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (!profile) {
      return;
    }
    const coins = profile.coins;
    const lastShown = profile.last_shown_coin_balance || coins;
    if (shownCoins.current === coins || coins <= lastShown) {
      setDisplayCoins(coins);
      shownCoins.current = coins;
      return;
    }
    if (!animatingCoins.current) {
      void runCount(lastShown, coins, setDisplayCoins, animatingCoins, shownCoins, () =>
        supabase.rpc('mark_coin_balance_shown'),
      );
    }
  }, [profile]);

  useEffect(() => {
    if (!profile) {
      return;
    }
    const bucks = profile.bucks;
    const lastShown = profile.last_shown_bucks_balance || bucks;
    if (shownBucks.current === bucks || bucks <= lastShown) {
      setDisplayBucks(bucks);
      shownBucks.current = bucks;
      return;
    }
    if (!animatingBucks.current) {
      void runCount(lastShown, bucks, setDisplayBucks, animatingBucks, shownBucks, () =>
        supabase.rpc('mark_bucks_balance_shown'),
      );
    }
  }, [profile]);

  if (!profile) {
    return (
      <button type="button" className="min-h-11 text-[12px] font-extrabold text-muted" onClick={requestWebWallet}>
        Wallet
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-label="Open wallet"
      onClick={requestWebWallet}
      className="flex min-h-11 items-center rounded-full border border-line bg-surface px-2.5">
      <span className="text-[12px] font-extrabold text-ink">{displayCoins}</span>
      <span className="mx-1.5 text-[12px] font-extrabold text-muted">·</span>
      <span className="text-[12px] font-extrabold text-[#1B7A4A]">${displayBucks.toFixed(2)}</span>
    </button>
  );
}

async function runCount(
  from: number,
  to: number,
  setValue: (value: number) => void,
  animating: { current: boolean },
  shownAt: { current: number | null },
  markShown: () => PromiseLike<unknown>,
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
