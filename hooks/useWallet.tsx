import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useBadgeCatalog } from '@/hooks/useBadges';
import { useMyProfile } from '@/hooks/useProfile';
import { setBadgeUnlockListener } from '@/lib/badgeActivity';
import type { NewBadge } from '@/lib/badges';
import type { BadgeDefinition } from '@/lib/types';
import type { TopUpRequest } from '@/lib/topUp';

export type BadgeUnlock = NewBadge & {
  definition?: BadgeDefinition;
};

export type OpenWalletOptions = {
  scrollToLatest?: boolean;
};

type WalletContextValue = {
  sheetOpen: boolean;
  sendOpen: boolean;
  topUp: TopUpRequest | null;
  scrollToLatest: boolean;
  openWallet: (options?: OpenWalletOptions) => void;
  closeWallet: () => void;
  openSend: () => void;
  closeSend: () => void;
  openTopUp: (request: TopUpRequest) => void;
  closeTopUp: () => void;
  closeAll: () => void;
  sentToast: string | null;
  showSentToast: (message: string) => void;
  unlocks: BadgeUnlock[];
  dismissUnlock: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { profile } = useMyProfile();
  const catalog = useBadgeCatalog();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [scrollToLatest, setScrollToLatest] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [topUp, setTopUp] = useState<TopUpRequest | null>(null);
  const [sentToast, setSentToast] = useState<string | null>(null);
  const [queue, setQueue] = useState<BadgeUnlock[]>([]);

  const byKey = useMemo(() => {
    const map = new Map((catalog.data ?? []).map((badge) => [badge.key, badge]));
    return map;
  }, [catalog.data]);

  useEffect(() => {
    setBadgeUnlockListener((awarded) => {
      if (awarded.length === 0) {
        return;
      }
      const next = awarded.map((row) => ({
        ...row,
        definition: byKey.get(row.key),
      }));
      setQueue((current) => [...current, ...next]);
    });
    return () => setBadgeUnlockListener(null);
  }, [byKey]);

  const openWallet = useCallback((options?: OpenWalletOptions) => {
    if (profile) {
      setSendOpen(false);
      setTopUp(null);
      setScrollToLatest(Boolean(options?.scrollToLatest));
      setSheetOpen(true);
    }
  }, [profile]);

  const openSend = useCallback(() => {
    setSheetOpen(false);
    setTopUp(null);
    setSendOpen(true);
  }, []);

  const openTopUp = useCallback((request: TopUpRequest) => {
    setSheetOpen(false);
    setSendOpen(false);
    setTopUp(request);
  }, []);

  const closeAll = useCallback(() => {
    setSheetOpen(false);
    setScrollToLatest(false);
    setSendOpen(false);
    setTopUp(null);
  }, []);

  const showSentToast = useCallback((message: string) => {
    setSentToast(message);
  }, []);

  useEffect(() => {
    if (!sentToast) {
      return;
    }
    const timer = setTimeout(() => setSentToast(null), 2600);
    return () => clearTimeout(timer);
  }, [sentToast]);

  const value = useMemo<WalletContextValue>(
    () => ({
      sheetOpen,
      sendOpen,
      topUp,
      scrollToLatest,
      openWallet,
      closeWallet: () => {
        setSheetOpen(false);
        setScrollToLatest(false);
      },
      openSend,
      closeSend: () => setSendOpen(false),
      openTopUp,
      closeTopUp: () => setTopUp(null),
      closeAll,
      sentToast,
      showSentToast,
      unlocks: queue,
      dismissUnlock: () => setQueue((current) => current.slice(1)),
    }),
    [closeAll, openSend, openTopUp, openWallet, queue, scrollToLatest, sendOpen, sentToast, showSentToast, sheetOpen, topUp],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const value = useContext(WalletContext);
  if (!value) {
    throw new Error('useWallet must be used inside WalletProvider');
  }
  return value;
}

export function useWalletOptional() {
  return useContext(WalletContext);
}
