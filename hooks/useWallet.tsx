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
  openWallet: () => void;
  closeWallet: () => void;
  unlocks: BadgeUnlock[];
  dismissUnlock: () => void;
};

const WalletContext = createContext<WalletContextValue | null>(null);

export function WalletProvider({ children }: { children: ReactNode }) {
  const { profile } = useMyProfile();
  const catalog = useBadgeCatalog();
  const [sheetOpen, setSheetOpen] = useState(false);
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
      setSheetOpen(true);
    }
  }, [profile]);

  const value = useMemo<WalletContextValue>(
    () => ({
      sheetOpen,
      openWallet,
      closeWallet: () => setSheetOpen(false),
      unlocks: queue,
      dismissUnlock: () => setQueue((current) => current.slice(1)),
    }),
    [openWallet, queue, sheetOpen],
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
