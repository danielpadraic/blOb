import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { JoinConfirmModal } from '@/components/challenge/JoinConfirmModal';
import { useJoinChallenge } from '@/hooks/useChallenge';
import { useMyProfile } from '@/hooks/useProfile';
import { useWalletOptional } from '@/hooks/useWallet';
import { walletBalance } from '@/lib/currency';
import { bucksJoinCta } from '@/lib/joinCta';
import type { Challenge } from '@/lib/types';
import { getErrorMessage } from '@/utils/errors';

type JoinConfirmContextValue = {
  open: (challenge: Challenge) => void;
  close: () => void;
  confirm: () => void;
  loading: boolean;
  challenge: Challenge | null;
  error: string | null;
};

const JoinConfirmContext = createContext<JoinConfirmContextValue | null>(null);

export function JoinConfirmProvider({ children }: { children: ReactNode }) {
  const join = useJoinChallenge();
  const { profile } = useMyProfile();
  const wallet = useWalletOptional();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<Challenge | null>(null);
  const topUpOpen = Boolean(wallet?.topUp);

  const close = useCallback(() => {
    if (join.isPending) {
      return;
    }
    pendingRef.current = null;
    setError(null);
    setChallenge(null);
  }, [join.isPending]);

  const open = useCallback((next: Challenge) => {
    pendingRef.current = null;
    setError(null);
    setChallenge(next);
  }, []);

  const confirm = useCallback(async () => {
    if (!challenge || join.isPending) {
      return;
    }
    const buyIn = Math.max(Number(challenge.buy_in_amount) || 0, 0);
    const cta = bucksJoinCta({
      currency: challenge.currency,
      buyIn,
      wallet: walletBalance(profile, challenge.currency),
      hasProfile: Boolean(profile),
    });
    if (cta.needsTopUp) {
      pendingRef.current = challenge;
      setChallenge(null);
      wallet?.openTopUp({ amount: cta.shortfall });
      return;
    }
    try {
      setError(null);
      await join.mutateAsync(challenge.id);
      pendingRef.current = null;
      setChallenge(null);
    } catch (caught) {
      setError(getErrorMessage(caught));
    }
  }, [challenge, join, profile, wallet]);

  useEffect(() => {
    if (topUpOpen || !pendingRef.current) {
      return;
    }
    const next = pendingRef.current;
    pendingRef.current = null;
    setChallenge(next);
  }, [topUpOpen]);

  const value = useMemo<JoinConfirmContextValue>(
    () => ({
      open,
      close,
      confirm: () => {
        void confirm();
      },
      loading: join.isPending,
      challenge,
      error,
    }),
    [challenge, close, confirm, error, join.isPending, open],
  );

  return <JoinConfirmContext.Provider value={value}>{children}</JoinConfirmContext.Provider>;
}

export function JoinConfirmLayer() {
  const join = useJoinConfirm();
  if (!join.challenge) {
    return null;
  }
  return (
    <View pointerEvents="auto" style={styles.layer}>
      <JoinConfirmModal
        visible
        challenge={join.challenge}
        loading={join.loading}
        error={join.error}
        onClose={join.close}
        onConfirm={join.confirm}
      />
    </View>
  );
}

export function useJoinConfirm() {
  const value = useContext(JoinConfirmContext);
  if (!value) {
    throw new Error('useJoinConfirm must be used inside JoinConfirmProvider');
  }
  return value;
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 200,
    elevation: 200,
  },
});
