import { useRouter } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { JoinConfirmSheet } from '@/components/challenge/JoinConfirmSheet';
import { BlobMascot } from '@/components/mascot/BlobMascot';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { useGeoCashOptional } from '@/components/geo/GeoCashHost';
import { useOfficialDobOptional } from '@/components/interests/OfficialDobHost';
import { useJoinChallenge } from '@/hooks/useChallenge';
import { useMyProfile } from '@/hooks/useProfile';
import { useWalletOptional } from '@/hooks/useWallet';
import { challengeDetailHref } from '@/lib/routes';
import { walletBalance } from '@/lib/currency';
import {
  joinActionForShape,
  challengeMoneyShape,
  isGeoGateDeny,
  skipsCashGeo,
} from '@/lib/geo/eligibility';
import { bucksJoinCta } from '@/lib/joinCta';
import { officialCashJoinBlock } from '@/lib/officialCash';
import { officialDobStatus } from '@/lib/officialDob';
import { emptyJoinRolePicks, type JoinRolePicks } from '@/lib/joinRole';
import { THEME } from '@/lib/theme';
import type { Challenge } from '@/lib/types';
import { getJoinChallengeMessage } from '@/utils/errors';

type JoinConfirmContextValue = {
  open: (challenge: Challenge) => void;
  close: () => void;
  confirm: (picks?: JoinRolePicks) => void;
  setPicks: (next: JoinRolePicks) => void;
  picks: JoinRolePicks;
  loading: boolean;
  challenge: Challenge | null;
  error: string | null;
  welcome: boolean;
  /** Why a house cash Official cannot be joined right now, or '' when it can. */
  cashBlockedCopy: (challenge?: Challenge | null) => string;
};

const JoinConfirmContext = createContext<JoinConfirmContextValue | null>(null);

export function JoinConfirmProvider({ children }: { children: ReactNode }) {
  const join = useJoinChallenge();
  const router = useRouter();
  const { profile } = useMyProfile();
  const wallet = useWalletOptional();
  const officialDob = useOfficialDobOptional();
  const geo = useGeoCashOptional();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [picks, setPicks] = useState<JoinRolePicks>(emptyJoinRolePicks);
  const [welcome, setWelcome] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<Challenge | null>(null);
  const topUpOpen = Boolean(wallet?.topUp);

  const close = useCallback(() => {
    if (join.isPending) {
      return;
    }
    pendingRef.current = null;
    setError(null);
    setPicks(emptyJoinRolePicks());
    setChallenge(null);
  }, [join.isPending]);

  /**
   * Cash Officials are shut while the payouts MID is held, and the legal gates
   * stand regardless. Every join surface funnels through open(), so this is the
   * one place a paid house join can be stopped.
   */
  const cashBlock = useCallback(
    (next?: Challenge | null) =>
      officialCashJoinBlock({
        challenge: next,
        dobStatus: officialDobStatus(profile?.date_of_birth),
        declaredRegion: profile?.declared_region,
      }),
    [profile?.date_of_birth, profile?.declared_region],
  );

  const open = useCallback((next: Challenge) => {
    if (cashBlock(next).blocked) {
      return;
    }
    if (next.is_official && officialDob && !officialDob.ensureAdult()) {
      return;
    }
    pendingRef.current = null;
    setError(null);
    const action = skipsCashGeo(next) ? null : joinActionForShape(challengeMoneyShape(next));
    if (action && geo) {
      void geo.ensure({ action, challengeId: next.id }).then((ok) => {
        if (ok) {
          setChallenge(next);
        }
      });
      return;
    }
    setChallenge(next);
  }, [cashBlock, geo, officialDob]);

  const confirm = useCallback(async (picks?: JoinRolePicks) => {
    if (!challenge || join.isPending) {
      return;
    }
    const cash = cashBlock(challenge);
    if (cash.blocked) {
      setError(cash.copy);
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
      await join.mutateAsync(
        picks?.rosterRole
          ? {
              challengeId: challenge.id,
              rosterRole: picks.rosterRole,
              scoringLane: picks.rosterRole === 'observer' ? null : picks.scoringLane,
              selfModerator: Boolean(picks.selfModerator),
            }
          : challenge.id,
      );
      const joinedId = challenge.id;
      pendingRef.current = null;
      setChallenge(null);
      setPicks(emptyJoinRolePicks());
      setWelcome(true);
      router.push(challengeDetailHref(joinedId, 'lobby', null, { tab: 'overview' }));
      setTimeout(() => setWelcome(false), 1600);
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
  }, [cashBlock, challenge, geo, join, officialDob, picks, profile, router, wallet]);

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
      confirm: (next?: JoinRolePicks) => {
        void confirm(next);
      },
      setPicks,
      picks,
      loading: join.isPending || Boolean(geo?.busy),
      challenge,
      error,
      welcome,
      cashBlockedCopy: (next?: Challenge | null) => {
        const block = cashBlock(next);
        return block.blocked ? block.copy : '';
      },
    }),
    [cashBlock, challenge, close, confirm, error, geo?.busy, join.isPending, open, picks, welcome],
  );

  return <JoinConfirmContext.Provider value={value}>{children}</JoinConfirmContext.Provider>;
}

export function JoinConfirmLayer() {
  const join = useJoinConfirm();
  return (
    <View pointerEvents="box-none" style={styles.layer}>
      {join.challenge ? (
        <JoinConfirmSheet
          visible
          challenge={join.challenge}
          loading={join.loading}
          error={join.error}
          picks={join.picks}
          onPicks={join.setPicks}
          onClose={join.close}
          onConfirm={() => join.confirm(join.picks)}
        />
      ) : null}
      <ChromeOverlay visible={join.welcome} align="center" dim="heavy" zIndex={220}>
        <View style={{ alignItems: 'center', padding: 24 }}>
          <BlobMascot size={120} motion="float" />
          <AppText className="mt-3 text-[22px] font-extrabold" style={{ color: THEME.primaryForeground }}>
            You’re in
          </AppText>
        </View>
      </ChromeOverlay>
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
