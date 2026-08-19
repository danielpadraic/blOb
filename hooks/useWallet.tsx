import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { useBadgeCatalog } from '@/hooks/useBadges';
import { useMyProfile } from '@/hooks/useProfile';
import { setBadgeUnlockListener } from '@/lib/badgeActivity';
import type { NewBadge } from '@/lib/badges';
import type { BadgeDefinition } from '@/lib/types';

export type BadgeUnlock = NewBadge & {
  definition?: BadgeDefinition;
};

type WalletContextValue = {
  sheetOpen: boolean;
  sendOpen: boolean;
  openWallet: () => void;
  closeWallet: () => void;
  openSend: () => void;
  closeSend: () => void;
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
  const [sendOpen, setSendOpen] = useState(false);
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

  const openWallet = useCallback(() => {
    if (profile) {
      setSendOpen(false);
      setSheetOpen(true);
    }
  }, [profile]);

  const openSend = useCallback(() => {
    setSheetOpen(false);
    setSendOpen(true);
  }, []);

  const closeAll = useCallback(() => {
    setSheetOpen(false);
    setSendOpen(false);
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
      openWallet,
      closeWallet: () => setSheetOpen(false),
      openSend,
      closeSend: () => setSendOpen(false),
      closeAll,
      sentToast,
      showSentToast,
      unlocks: queue,
      dismissUnlock: () => setQueue((current) => current.slice(1)),
    }),
    [closeAll, openSend, openWallet, queue, sendOpen, sentToast, showSentToast, sheetOpen],
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
