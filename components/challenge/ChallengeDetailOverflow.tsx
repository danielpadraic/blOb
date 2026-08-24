import { useCallback, useEffect, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { CancelChallengeSheet } from '@/components/challenge/CancelChallengeSheet';
import { LeaveChallengeSheet } from '@/components/challenge/LeaveChallengeSheet';
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
  useLeaveChallenge,
  useNudgeChallengeStart,
  useResolveStartRoll,
} from '@/hooks/useChallenge';
import { useMyProfile } from '@/hooks/useProfile';
import { canCancelChallenge, countOtherJoiners } from '@/lib/challengeCancel';
import { canParticipantLeave } from '@/lib/challengeLeave';
import { canHostQuickEdit } from '@/lib/challengeStart';
import { isLiveCompetitor } from '@/lib/challenges';
import { copy } from '@/lib/copy';
import { isOfficialAccount } from '@/lib/official';
import { canEditOfficialDetails, canOpenOfficialTools } from '@/lib/officialScoring';
import { getCancelChallengeMessage, getLeaveChallengeMessage, getStartUpdateMessage } from '@/utils/errors';

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
  const leave = useLeaveChallenge();
  const nudge = useNudgeChallengeStart();
  const resolveRoll = useResolveStartRoll();

  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [rollDismissed, setRollDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const challenge = challengeQuery.data ?? null;
  const officialViewer = isOfficialAccount(profile);
  const joined = Boolean(
    user?.id && roster.data?.some((row) => row.user_id === user.id && isLiveCompetitor(row)),
  );
  const canEdit = canHostQuickEdit({ challenge, viewerId: user?.id });
  const canDetails = canEditOfficialDetails({ challenge, viewerId: user?.id, profile }) && !canEdit;
  const canTools = canOpenOfficialTools({ challenge, viewerId: user?.id, profile });
  const canCancel = canCancelChallenge({
    challenge,
    viewerId: user?.id,
    official: officialViewer,
    otherJoiners: countOtherJoiners(roster.data, challenge?.created_by),
    rosterReady: roster.data != null,
  });
  const canLeave = canParticipantLeave({ challenge, joined });
  const showOverflow = canEdit || canDetails || canTools || canCancel || canLeave;
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
        setError(getCancelChallengeMessage(err));
      },
    });
  }

  function confirmLeave() {
    if (!id || leave.isPending) {
      return;
    }
    setError(null);
    leave.mutate(id, {
      onSuccess: () => {
        setLeaveOpen(false);
      },
      onError: (err) => {
        setError(getLeaveChallengeMessage(err));
      },
    });
  }

  const actions: ChallengeOverflowAction[] = [];
  if (canTools) {
    actions.push({
      key: 'official',
      label: 'Official tools',
      onPress: () => {
        if (!id) {
          return;
        }
        router.push(`/challenges/${id}/official`);
      },
    });
  }
  if (canDetails) {
    actions.push({
      key: 'details',
      label: copy('challenge.editDetails'),
      onPress: () => {
        if (!id) {
          return;
        }
        router.push(`/challenges/${id}/details`);
      },
    });
  }
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
          onError: (err) => setError(getStartUpdateMessage(err)),
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
  if (canLeave) {
    actions.push({
      key: 'leave',
      label: copy('challenge.leave'),
      onPress: () => {
        setError(null);
        setLeaveOpen(true);
      },
    });
  }
  if (canCancel) {
    actions.push({
      key: 'cancel',
      label: officialViewer ? copy('challenge.delete') : copy('challenge.cancel'),
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
    leaveOpen,
    closeLeave: () => setLeaveOpen(false),
    challenge,
    loading: cancel.isPending || leave.isPending || nudge.isPending || resolveRoll.isPending,
    error,
    confirmCancel,
    confirmLeave,
    actions,
    rollOpen,
    closeRoll: () => setRollDismissed(true),
    applyStart: (startsAt: string, mode: 'keep' | 'shorten') => {
      if (!id) {
        return;
      }
      setError(null);
      resolveRoll.mutate(
        { challengeId: id, startsAt, mode },
        {
          onSuccess: () => setRollDismissed(true),
          onError: (err) => setError(getStartUpdateMessage(err)),
        },
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

export function ChallengeHeroOverflowButton({ light = true }: { light?: boolean }) {
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

  if (!overflowVisible) {
    return null;
  }
  return <ChallengeOverflowButton light={light} onPress={openOverflowMenu} />;
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
          error={overflow.cancelOpen ? overflow.error : null}
          onClose={overflow.closeCancel}
          onConfirm={overflow.confirmCancel}
        />
      ) : null}
      {overflow.challenge ? (
        <LeaveChallengeSheet
          visible={overflow.leaveOpen}
          loading={overflow.loading}
          error={overflow.leaveOpen ? overflow.error : null}
          onClose={overflow.closeLeave}
          onConfirm={overflow.confirmLeave}
        />
      ) : null}
      {overflow.challenge ? (
        <StartRollSheet
          visible={overflow.rollOpen}
          challenge={overflow.challenge}
          loading={overflow.loading}
          error={overflow.error}
          onClose={overflow.closeRoll}
          onApply={overflow.applyStart}
        />
      ) : null}
    </>
  );
}
