import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { CancelChallengeSheet } from '@/components/challenge/CancelChallengeSheet';
import {
  ChallengeMenuPopover,
  ChallengeOverflowButton,
  type MenuAnchor,
} from '@/components/challenge/ChallengeOverflowMenu';
import { WalletBar } from '@/components/wallet/WalletBar';
import { useAuth } from '@/hooks/useAuth';
import { useCancelChallenge, useChallenge, useChallengeParticipants } from '@/hooks/useChallenge';
import { useMyProfile } from '@/hooks/useProfile';
import { canCancelChallenge, countOtherJoiners } from '@/lib/challengeCancel';
import { isOfficialAccount } from '@/lib/official';
import { getErrorMessage } from '@/utils/errors';

let overflowVisible = false;
let openOverflowMenu = (_anchor: MenuAnchor) => {};
const overflowListeners = new Set<() => void>();

function publishOverflow(visible: boolean, openMenu: (anchor: MenuAnchor) => void) {
  overflowVisible = visible;
  openOverflowMenu = openMenu;
  overflowListeners.forEach((listener) => listener());
}

export function useChallengeDetailOverflow() {
  const params = useLocalSearchParams<{ id: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const challengeQuery = useChallenge(id);
  const roster = useChallengeParticipants(id);
  const cancel = useCancelChallenge();

  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const challenge = challengeQuery.data ?? null;
  const showOverflow = canCancelChallenge({
    challenge,
    viewerId: user?.id,
    official: isOfficialAccount(profile),
    otherJoiners: countOtherJoiners(roster.data, challenge?.created_by),
    rosterReady: roster.data != null,
  });

  const openMenu = useCallback((anchor: MenuAnchor) => {
    setMenu((current) => (current ? null : anchor));
  }, []);

  useEffect(() => {
    publishOverflow(showOverflow, openMenu);
    return () => {
      publishOverflow(false, () => {});
    };
  }, [openMenu, showOverflow]);

  function confirmCancel() {
    if (!id || cancel.isPending) {
      return;
    }
    setError(null);
    cancel.mutate(id, {
      onSuccess: () => {
        setCancelOpen(false);
        router.replace({ pathname: '/challenges', params: { notice: 'cancelled' } });
      },
      onError: (err) => {
        setError(getErrorMessage(err));
      },
    });
  }

  return {
    showOverflow,
    openMenu,
    menu,
    closeMenu: () => setMenu(null),
    cancelOpen,
    openCancel: () => {
      setError(null);
      setCancelOpen(true);
    },
    closeCancel: () => setCancelOpen(false),
    challenge,
    loading: cancel.isPending,
    error,
    confirmCancel,
  };
}

export function ChallengeDetailHeaderRight() {
  const [, setRev] = useState(0);
  useEffect(() => {
    const listener = () => setRev((value) => value + 1);
    overflowListeners.add(listener);
    if (overflowVisible) {
      listener();
    }
    return () => {
      overflowListeners.delete(listener);
    };
  }, []);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <WalletBar />
      {overflowVisible ? <ChallengeOverflowButton onPress={openOverflowMenu} /> : null}
    </View>
  );
}

export function ChallengeDetailOverflowHost({
  overflow,
}: {
  overflow: ReturnType<typeof useChallengeDetailOverflow>;
}) {
  return (
    <>
      <ChallengeMenuPopover
        anchor={overflow.menu}
        onClose={overflow.closeMenu}
        onCancelPress={overflow.openCancel}
      />
      {overflow.challenge ? (
        <CancelChallengeSheet
          visible={overflow.cancelOpen}
          challenge={overflow.challenge}
          loading={overflow.loading}
          error={overflow.error}
          onClose={overflow.closeCancel}
          onConfirm={overflow.confirmCancel}
        />
      ) : null}
    </>
  );
}
