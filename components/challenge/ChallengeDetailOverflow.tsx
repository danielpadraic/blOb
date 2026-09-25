import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';

import { CancelChallengeSheet } from '@/components/challenge/CancelChallengeSheet';
import { HouseAddPersonSheet } from '@/components/challenge/HouseAddPersonSheet';
import { LeaveChallengeSheet } from '@/components/challenge/LeaveChallengeSheet';
import { LiveMuteSheet, publishLiveMuteControl } from '@/components/challenge/LiveMuteSheet';
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
import { useLeaveOfficialCoin } from '@/hooks/useOfficialCoin';
import { isOfficialCoinChallenge, OFFICIAL_COIN_LEAVE_CONFIRM } from '@/lib/officialCoin';
import { usesAdvancedCreateEdit } from '@/lib/challengeExperience';
import { fetchChallengeModeratorIds } from '@/lib/challengeMods';
import { canHouseEditChallenge, canHostQuickEdit, canHostWizardEdit } from '@/lib/challengeStart';
import { useOfficialOps } from '@/hooks/useOfficialOps';
import { canHouseActOnChallenge } from '@/lib/officialOps';
import { challengeIsSettledForRigor, viewerCanHostAdd } from '@/lib/hostRigor';
import { isLiveCompetitor } from '@/lib/challenges';
import { copy } from '@/lib/copy';
import { asLiveMute, type LiveMute } from '@/lib/livePush';
import { isOfficialAccount } from '@/lib/official';
import { canEditOfficialDetails, canOpenOfficialTools } from '@/lib/officialScoring';
import { requestPushAfterValue } from '@/lib/push';
import { supabase } from '@/lib/supabase';
import { getCancelChallengeMessage, getErrorMessage, getLeaveChallengeMessage, getStartUpdateMessage } from '@/utils/errors';

let overflowVisible = false;
let openOverflowMenu = (_anchor: MenuAnchor) => {};
let openHouseAddPeopleFn = () => {};
const overflowListeners = new Set<() => void>();

export function openHouseAddPeople() {
  openHouseAddPeopleFn();
}

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
  const officialOpsQuery = useOfficialOps();
  const officialOps = officialOpsQuery.data === true;
  const challengeQuery = useChallenge(id);
  const roster = useChallengeParticipants(id);
  const queryClient = useQueryClient();
  const cancel = useCancelChallenge();
  const leave = useLeaveChallenge();
  const leaveCoin = useLeaveOfficialCoin();
  const nudge = useNudgeChallengeStart();
  const resolveRoll = useResolveStartRoll();

  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [houseAddOpen, setHouseAddOpen] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);
  const [rollDismissed, setRollDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const challenge = challengeQuery.data ?? null;
  const officialViewer = isOfficialAccount(profile);
  const joined = Boolean(
    user?.id && roster.data?.some((row) => row.user_id === user.id && isLiveCompetitor(row)),
  );
  const myRow = roster.data?.find((row) => row.user_id === user?.id);
  const liveMute = asLiveMute(myRow?.live_mute);
  const canMute = Boolean(user?.id && myRow && isLiveCompetitor(myRow));
  const modsQuery = useQuery({
    queryKey: ['challenge-moderators', id],
    queryFn: () => fetchChallengeModeratorIds(id!),
    enabled: Boolean(id),
  });
  const canHostEdit = canHostQuickEdit({ challenge, viewerId: user?.id });
  const canHouseEdit = canHouseEditChallenge({ challenge, officialOps });
  const canWizardEdit =
    canHostWizardEdit({
      challenge,
      viewerId: user?.id,
      moderatorIds: modsQuery.data,
    }) || canHouseEdit;
  const houseReady = officialOps;
  const houseDisabled = !canHouseActOnChallenge(challenge);
  const canHostAdd = viewerCanHostAdd({
    challenge,
    viewerId: user?.id,
    moderatorIds: modsQuery.data,
    officialOps,
  });
  const friendlyAddDisabled = challengeIsSettledForRigor(challenge?.status);
  const canDetails = canEditOfficialDetails({ challenge, viewerId: user?.id, profile });
  const canTools = canOpenOfficialTools({ challenge, viewerId: user?.id, profile });
  const canCancel = canCancelChallenge({
    challenge,
    viewerId: user?.id,
    official: officialViewer,
    otherJoiners: countOtherJoiners(roster.data, challenge?.created_by),
    rosterReady: roster.data != null,
  });
  const canLeave = canParticipantLeave({ challenge, joined });
  // Official Coin is the one Official room a person can walk away from, and
  // leaving drops the Weekly and the Monthly together.
  const coinRoom = isOfficialCoinChallenge(challenge);
  const canLeaveCoin = coinRoom && joined;
  const showOverflow =
    canWizardEdit ||
    canDetails ||
    canTools ||
    canCancel ||
    canLeave ||
    canLeaveCoin ||
    canMute ||
    houseReady ||
    canHostAdd;
  const rollPending = Boolean(challenge?.start_roll_pending) && canHostEdit;
  const rollOpen = rollPending && !rollDismissed;

  const openMenu = useCallback((anchor: MenuAnchor) => {
    setMenu((current) => (current ? null : anchor));
  }, []);

  useEffect(() => {
    publishOverflow(showOverflow, openMenu);
    openHouseAddPeopleFn = () => {
      setError(null);
      setHouseAddOpen(true);
    };
    return () => {
      publishOverflow(false, () => {});
      openHouseAddPeopleFn = () => {};
    };
  }, [openMenu, showOverflow]);

  const openMute = useCallback(() => {
    setError(null);
    setMuteOpen(true);
    requestPushAfterValue();
  }, []);

  useEffect(() => {
    publishLiveMuteControl({
      canMute,
      liveMute,
      open: openMute,
    });
    return () => {
      publishLiveMuteControl({ canMute: false, liveMute: 'all', open: () => {} });
    };
  }, [canMute, liveMute, openMute]);

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
    if (!id || leave.isPending || leaveCoin.isPending) {
      return;
    }
    setError(null);
    if (coinRoom) {
      leaveCoin.mutate(undefined, {
        onSuccess: () => {
          setLeaveOpen(false);
          router.replace('/challenges');
        },
        onError: (err) => {
          setError(getLeaveChallengeMessage(err));
        },
      });
      return;
    }
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
  if (canMute) {
    actions.push({
      key: 'live-alerts',
      label: 'Live notifications',
      onPress: () => {
        openMute();
      },
    });
  }
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
  if (canHostEdit) {
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
  }
  if (canWizardEdit) {
    actions.push({
      key: 'edit',
      label: copy('challenge.editChallenge'),
      onPress: () => {
        if (!id) {
          return;
        }
        router.push({
          pathname: '/challenges/create',
          params: usesAdvancedCreateEdit(challenge)
            ? { editId: id, mode: 'advanced' }
            : { editId: id },
        });
      },
    });
  }
  if (houseReady || canHostAdd) {
    actions.push({
      key: houseReady ? 'house-add' : 'host-add',
      section: houseReady ? copy('house.section') : undefined,
      label: copy('house.addPeople'),
      disabled: houseReady ? houseDisabled : friendlyAddDisabled || !canHostAdd,
      onPress: () => {
        setError(null);
        setHouseAddOpen(true);
      },
    });
  }
  if (canLeave || canLeaveCoin) {
    actions.push({
      key: 'leave',
      label: canLeaveCoin ? 'Leave Official' : copy('challenge.leave'),
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
    houseAddOpen,
    houseAddHostMode: canHostAdd && !houseReady,
    closeHouseAdd: () => setHouseAddOpen(false),
    closeLeave: () => setLeaveOpen(false),
    muteOpen,
    closeMute: () => setMuteOpen(false),
    liveMute,
    saveMute: (next: LiveMute) => {
      if (!id) {
        return;
      }
      void (async () => {
        const { error: muteError } = await supabase.rpc('set_challenge_live_mute', {
          p_challenge_id: id,
          p_mute: next,
        });
        if (muteError) {
          setError(getErrorMessage(muteError));
          return;
        }
        requestPushAfterValue();
        void queryClient.invalidateQueries({ queryKey: ['challenge-participants', id] });
        void queryClient.invalidateQueries({ queryKey: ['my-participation', id] });
      })();
    },
    challenge,
    coinRoom,
    loading:
      cancel.isPending ||
      leave.isPending ||
      leaveCoin.isPending ||
      nudge.isPending ||
      resolveRoll.isPending,
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
    <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 0 }}>
      <WalletBar compact />
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
          title={overflow.coinRoom ? OFFICIAL_COIN_LEAVE_CONFIRM.title : undefined}
          body={overflow.coinRoom ? OFFICIAL_COIN_LEAVE_CONFIRM.body : undefined}
          confirmLabel={overflow.coinRoom ? OFFICIAL_COIN_LEAVE_CONFIRM.confirm : undefined}
          cancelLabel={overflow.coinRoom ? OFFICIAL_COIN_LEAVE_CONFIRM.cancel : undefined}
          onClose={overflow.closeLeave}
          onConfirm={overflow.confirmLeave}
        />
      ) : null}
      {overflow.challenge ? (
        <HouseAddPersonSheet
          visible={overflow.houseAddOpen}
          challengeId={overflow.challenge.id}
          challengeTitle={overflow.challenge.title}
          hostMode={overflow.houseAddHostMode}
          disabled={
            overflow.houseAddHostMode
              ? challengeIsSettledForRigor(overflow.challenge.status)
              : !canHouseActOnChallenge(overflow.challenge)
          }
          onClose={overflow.closeHouseAdd}
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
      <LiveMuteSheet
        visible={overflow.muteOpen}
        value={overflow.liveMute}
        onClose={overflow.closeMute}
        onSave={overflow.saveMute}
      />
    </>
  );
}
