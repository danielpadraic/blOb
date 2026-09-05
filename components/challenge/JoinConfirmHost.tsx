import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { JoinConfirmModal } from '@/components/challenge/JoinConfirmModal';
import { useGeoCashOptional } from '@/components/geo/GeoCashHost';
import { useOfficialDobOptional } from '@/components/interests/OfficialDobHost';
import { useJoinChallenge } from '@/hooks/useChallenge';
import { useMyProfile } from '@/hooks/useProfile';
import { useWalletOptional } from '@/hooks/useWallet';
import { walletBalance } from '@/lib/currency';
import { joinActionForShape, challengeMoneyShape, isGeoGateDeny } from '@/lib/geo/eligibility';
import { bucksJoinCta } from '@/lib/joinCta';
import type { Challenge } from '@/lib/types';
import { getJoinChallengeMessage } from '@/utils/errors';

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
  const officialDob = useOfficialDobOptional();
  const geo = useGeoCashOptional();
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
    if (next.is_official && officialDob && !officialDob.ensureAdult()) {
      return;
    }
    pendingRef.current = null;
    setError(null);
    const action = joinActionForShape(challengeMoneyShape(next));
    if (action && geo) {
      void geo.ensure({ action, challengeId: next.id }).then((ok) => {
        if (ok) {
          setChallenge(next);
        }
      });
      return;
    }
    setChallenge(next);
  }, [geo, officialDob]);

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
      if (isGeoGateDeny(caught)) {
        geo?.showUnavailable();
        setChallenge(null);
        return;
      }
      const message = getJoinChallengeMessage(caught);
      if (
        challenge.is_official &&
        officialDob &&
        (message.includes('birth date') || message.includes('18 and up'))
      ) {
        officialDob.ensureAdult();
        setChallenge(null);
        return;
      }
      setError(message);
    }
  }, [challenge, geo, join, officialDob, profile, wallet]);

  useEffect(() => {
    if (topUpOpen || !pendingRef.current) {
      return;
    }
    const next = pendingRef.current;
    pendingRef.current = null;
    open(next);
  }, [open, topUpOpen]);

  const value = useMemo<JoinConfirmContextValue>(
    () => ({
      open,
      close,
      confirm: () => {
        void confirm();
      },
      loading: join.isPending || Boolean(geo?.busy),
      challenge,
      error,
    }),
    [challenge, close, confirm, error, geo?.busy, join.isPending, open],
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
