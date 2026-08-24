'use client';

import { useEffect, useRef, useState } from 'react';

import { supabase } from '~/lib/supabase';

type ProfileMoney = {
  coins: number;
  bucks: number;
  last_shown_coin_balance: number;
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function WalletBar({ userId }: { userId: string }) {
  const [profile, setProfile] = useState<ProfileMoney | null>(null);
  const [displayCoins, setDisplayCoins] = useState(0);
  const animating = useRef(false);
  const shownAt = useRef<number | null>(null);

  async function load() {
    const { data } = await supabase
      .from('profiles')
      .select('coins, bucks, last_shown_coin_balance')
      .eq('id', userId)
      .maybeSingle();
    if (!data) {
      return;
    }
    const next = {
      coins: Number((data as { coins?: number }).coins ?? 0),
      bucks: Number((data as { bucks?: number }).bucks ?? 0),
      last_shown_coin_balance: Number((data as { last_shown_coin_balance?: number }).last_shown_coin_balance ?? 0),
    };
    setProfile(next);
  }

  useEffect(() => {
    void load();
    const onFocus = () => {
      void load();
    };
    window.addEventListener('focus', onFocus);
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
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  useEffect(() => {
    if (!profile) {
      return;
    }
    const coins = profile.coins;
    const lastShown = profile.last_shown_coin_balance || coins;
    if (shownAt.current === coins) {
      setDisplayCoins(coins);
      return;
    }
    if (coins <= lastShown) {
      setDisplayCoins(coins);
      shownAt.current = coins;
      return;
    }
    if (!animating.current) {
      void countUp(lastShown, coins);
    }
  }, [profile]);

  async function countUp(from: number, to: number) {
    animating.current = true;
    const steps = Math.min(24, Math.max(8, to - from));
    const step = (to - from) / steps;
    for (let i = 1; i <= steps; i += 1) {
      setDisplayCoins(Math.round(from + step * i));
      await sleep(24);
    }
    setDisplayCoins(to);
    animating.current = false;
    shownAt.current = to;
    await supabase.rpc('mark_coin_balance_shown');
  }

  if (!profile) {
    return <span className="min-h-11 text-[12px] font-extrabold text-muted">Wallet</span>;
  }

  return (
    <div className="flex min-h-11 items-center rounded-full border border-line bg-surface px-2.5">
      <span className="text-[12px] font-extrabold text-ink">{displayCoins}</span>
      <span className="mx-1.5 text-[12px] font-extrabold text-muted">·</span>
      <span className="text-[12px] font-extrabold text-[#1B7A4A]">${profile.bucks.toFixed(2)}</span>
    </div>
  );
}
