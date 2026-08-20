import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { CancelChallengeSheet } from '@/components/challenge/CancelChallengeSheet';
import { StartRollSheet } from '@/components/challenge/StartRollSheet';
import {
  ChallengeMenuPopover,
  ChallengeOverflowButton,
  type ChallengeOverflowAction,
  type MenuAnchor,
} from '@/components/challenge/ChallengeOverflowMenu';
import { WalletBar } from '@/components/wallet/WalletBar';
import { useAuth } from '@/hooks/useAuth';
import {
  useCancelChallenge,
  useChallenge,
  useChallengeParticipants,
  useNudgeChallengeStart,
  useResolveStartRoll,
} from '@/hooks/useChallenge';
import { useMyProfile } from '@/hooks/useProfile';
import { canCancelChallenge, countOtherJoiners } from '@/lib/challengeCancel';
import { canHostQuickEdit } from '@/lib/challengeStart';
import { copy } from '@/lib/copy';
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
  const nudge = useNudgeChallengeStart();
  const resolveRoll = useResolveStartRoll();

  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rollDismissed, setRollDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const challenge = challengeQuery.data ?? null;
  const canEdit = canHostQuickEdit({ challenge, viewerId: user?.id });
  const canCancel = canCancelChallenge({
    challenge,
    viewerId: user?.id,
    official: isOfficialAccount(profile),
    otherJoiners: countOtherJoiners(roster.data, challenge?.created_by),
    rosterReady: roster.data != null,
  });
  const showOverflow = canEdit || canCancel;
  const rollPending = Boolean(challenge?.start_roll_pending) && canEdit;
  const rollOpen = rollPending && !rollDismissed;

  const openMenu = useCallback((anchor: MenuAnchor) => {
    setMenu((current) => (current ? null : anchor));
  }, []);

  useEffect(() => {
    publishOverflow(showOverflow, openMenu);
    return () => {
      publishOverflow(false, () => {});
    };
  }, [openMenu, showOverflow]);

  useEffect(() => {
    setRollDismissed(false);
  }, [challenge?.starts_at, challenge?.start_roll_pending]);

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

  const actions: ChallengeOverflowAction[] = [];
  if (canEdit) {
    actions.push({
      key: 'tomorrow',
      label: copy('challenge.startTomorrow'),
      onPress: () => {
        if (!id || nudge.isPending) {
          return;
        }
        setError(null);
        nudge.mutate(id, {
          onSuccess: () => setRollDismissed(false),
          onError: (err) => setError(getErrorMessage(err)),
        });
      },
    });
    actions.push({
      key: 'edit',
      label: copy('challenge.editChallenge'),
      onPress: () => {
        if (!id) {
          return;
        }
        router.push({ pathname: '/challenges/create', params: { editId: id } });
      },
    });
  }
  if (canCancel) {
    actions.push({
      key: 'cancel',
      label: copy('challenge.cancel'),
      danger: true,
      onPress: () => {
        setError(null);
        setCancelOpen(true);
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
    loading: cancel.isPending || nudge.isPending || resolveRoll.isPending,
    error,
    confirmCancel,
    actions,
    rollOpen,
    closeRoll: () => setRollDismissed(true),
    resolveKeep: () => {
      if (!id) {
        return;
      }
      setError(null);
      resolveRoll.mutate(
        { challengeId: id, keep: true },
        { onError: (err) => setError(getErrorMessage(err)) },
      );
    },
    resolveShorten: () => {
      if (!id) {
        return;
      }
      setError(null);
      resolveRoll.mutate(
        { challengeId: id, keep: false },
        { onError: (err) => setError(getErrorMessage(err)) },
      );
    },
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
        actions={overflow.actions}
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
      {overflow.challenge ? (
        <StartRollSheet
          visible={overflow.rollOpen}
          challenge={overflow.challenge}
          loading={overflow.loading}
          error={overflow.error}
          onClose={overflow.closeRoll}
          onKeep={overflow.resolveKeep}
          onShorten={overflow.resolveShorten}
        />
      ) : null}
    </>
  );
}
