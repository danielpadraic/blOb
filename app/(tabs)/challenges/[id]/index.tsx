import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchPublicProfilesByIds } from '@/lib/social';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FeedList } from '@/components/feed/FeedList';
import { ChallengeDetailsCard } from '@/components/challenge/ChallengeDetailsCard';
import { ChallengeHeroCard } from '@/components/challenge/ChallengeHeroCard';
import { ChallengeInvitesCard } from '@/components/challenge/ChallengeInvitesCard';
import { ChallengeLeaderboard } from '@/components/challenge/ChallengeLeaderboard';
import { ChallengePrizeLine } from '@/components/challenge/ChallengePrizeLine';
import { FieldNoteLabel, ChallengeNotesProvider } from '@/components/challenge/FieldNote';
import { OfficialMoneyBoard } from '@/components/challenge/OfficialMoneyBoard';
import { ChallengeDetailHeaderRight } from '@/components/challenge/ChallengeDetailOverflow';
import { useInviteHost } from '@/components/challenge/InviteHost';
import { useJoinConfirm } from '@/components/challenge/JoinConfirmHost';
import { JoinCtaButton, JOIN_CTA_HEIGHT } from '@/components/challenge/JoinCtaButton';
import { HealthProofCaption } from '@/components/challenge/HealthProofCaption';
import { SettleConfirmModal } from '@/components/challenge/SettleConfirmModal';
import { SettlementSummary } from '@/components/challenge/SettlementSummary';
import { StakeAmount } from '@/components/currency/CurrencyMark';
import { MascotState } from '@/components/mascot/MascotState';
import { StackBackButton, useDismissTo } from '@/components/navigation/StackBackButton';
import { BODY_METRICS_HREF, LOBBY_HREF } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import {
  useChallenge,
  useChallengeParticipants,
  useChallengeSettlement,
  useMarkChallengeJudging,
  useSettleChallenge,
} from '@/hooks/useChallenge';
import {
  useCreateComment,
  useCreatePost,
  useFeed,
  useToggleReaction,
} from '@/hooks/useFeed';
import { useMyProfile, useProfile } from '@/hooks/useProfile';
import { useStartOnWatch } from '@/hooks/useStartOnWatch';
import { usePeriodCheckin, useSubmittedCheckinCount } from '@/hooks/useChallengeCheckin';
import { usePeriodCompletions } from '@/hooks/useWorkoutSubmission';
import { methodLabel, proofDisplayName, signupProofLines } from '@/lib/challengeProofs';
import { challengeRuleCopy } from '@/lib/challengeRuleCopy';
import {
  challengeTargetCount,
  countLiveCompetitors,
  isChallengeFull,
  isPointsChallenge,
  isUnlimitedChallenge,
  lastManStandingRequirement,
  requiredChallengeProofs,
  totalTaskPoints,
} from '@/lib/challenges';
import {
  canMarkJudging,
  canSettleChallenge,
  completerCount,
  distributableAt,
  hasChallengeEnded,
  hasChallengeStarted,
  isClosedForLogs,
  isDistributeGateOpen,
  isJoinWindowOpen,
  payoutCountdownLabel,
  startsInLabel,
} from '@/lib/settlement';
import {
  isOfficialJoinable,
  isOfficialSeriesChallenge,
  officialAlreadyStartedCopy,
} from '@/lib/officialSeries';
import { entryFieldNote, userStartNeededLabel } from '@/lib/challengeFieldNotes';
import { canOpenOfficialTools } from '@/lib/officialScoring';
import { heroRingDays } from '@/lib/challengeStart';
import { isInviteOnlyChallenge } from '@/lib/challengeLane';
import { formatWalletAmount, isBucksChallenge, walletBalance } from '@/lib/currency';
import { challengeGoalLabel, challengeDurationDays } from '@/lib/challengeGoal';
import { bucksJoinCta } from '@/lib/joinCta';
import { hasCompletedBodyMetrics } from '@/lib/bodyMetrics';
import { tabBarLift, THEME } from '@/lib/theme';
import { copy } from '@/lib/copy';
import { getErrorMessage } from '@/utils/errors';

const BODY_METRICS_JOIN_COPY =
  'Missing: physical details. Official Challenges need them for matching — they stay private.';

export default function ChallengeDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    returnTo?: string;
    logged?: string;
    funded?: string;
    postId?: string;
  }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const highlightPostId = Array.isArray(params.postId) ? params.postId[0] : params.postId;
  const loggedParam = Array.isArray(params.logged) ? params.logged[0] : params.logged;
  const fundedParam = Array.isArray(params.funded) ? params.funded[0] : params.funded;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useDismissTo(returnTo === 'feed' ? '/feed' : LOBBY_HREF);
  const { user } = useAuth();
  const { profile, refetch: refetchProfile } = useMyProfile();
  const challengeQuery = useChallenge(id);
  const hostQuery = useProfile(challengeQuery.data?.created_by ?? undefined);
  const roster = useChallengeParticipants(id);
  const boardProfiles = useQuery({
    queryKey: ['challenge-board-profiles', id, (roster.data ?? []).map((row) => row.user_id).join(',')],
    enabled: Boolean(id && roster.data && roster.data.length > 0),
    queryFn: () => fetchPublicProfilesByIds((roster.data ?? []).map((row) => row.user_id)),
  });
  const boardRoster = useMemo(() => {
    const map = new Map((boardProfiles.data ?? []).map((profile) => [profile.id, profile]));
    return (roster.data ?? []).map((row) => ({
      ...row,
      profile: map.get(row.user_id) ?? row.profile,
    }));
  }, [boardProfiles.data, roster.data]);
  const periodCheckin = usePeriodCheckin(id, challengeQuery.data);
  const submittedCheckins = useSubmittedCheckinCount(id, challengeQuery.data);
  const completions = usePeriodCompletions(id, challengeQuery.data);
  const joinSheet = useJoinConfirm();
  const inviteHost = useInviteHost();
  const markJudging = useMarkChallengeJudging();
  const settle = useSettleChallenge();
  const settlementQuery = useChallengeSettlement(id);
  const feed = useFeed(id);
  const createPost = useCreatePost(id);
  const createComment = useCreateComment(id);
  const toggleReaction = useToggleReaction();

  const [judgeOpen, setJudgeOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [watchToast, setWatchToast] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const challenge = challengeQuery.data;
  const participation = useMemo(
    () => roster.data?.find((row) => row.user_id === user?.id) ?? null,
    [roster.data, user?.id],
  );
  const isJoined = Boolean(participation);
  const isHost = Boolean(challenge && user?.id && challenge.created_by === user.id);
  const showOfficialTools = canOpenOfficialTools({
    challenge,
    viewerId: user?.id,
    profile,
  });
  function openInvite() {
    if (!challenge) {
      return;
    }
    inviteHost?.open({
      challengeId: challenge.id,
      challengeTitle: challenge.title,
      allowSendToPeople: isOfficialJoinable(challenge) || isHost,
      defaultAudience: challenge.visibility === 'friends' ? 'friends' : 'public',
    });
  }
  const competitorCount = useMemo(() => {
    if (!roster.data) {
      return Math.max(Number(challenge?.participant_count) || 0, isJoined ? 1 : 0);
    }
    return countLiveCompetitors(roster.data);
  }, [challenge?.participant_count, isJoined, roster.data]);
  const durationDays = challengeDurationDays(challenge);
  const loggedToday = periodCheckin.data?.phase === 'submitted';
  const checkinPhase = loggedToday ? 'submitted' : (periodCheckin.data?.phase ?? 'none');
  const daysCompleted = heroRingDays({
    status: challengeQuery.data?.status,
    submitted: Math.max(submittedCheckins.data ?? 0, loggedToday ? 1 : 0),
  });

  const joinBlocked = useMemo(() => {
    if (!challenge || isJoined) {
      return null;
    }
    if (isHost) {
      return 'You’re already in this challenge.';
    }
    if (challenge.status === 'settled' || challenge.status === 'judging' || challenge.status === 'cancelled_underfilled' || challenge.status === 'cancelled') {
      return 'This challenge is no longer accepting competitors.';
    }
    if (!isJoinWindowOpen(challenge)) {
      return officialAlreadyStartedCopy();
    }
    if (
      challenge.ends_at &&
      !challenge.is_unlimited &&
      new Date() >= new Date(challenge.ends_at)
    ) {
      return 'This challenge has ended.';
    }
    if (isChallengeFull(challenge)) {
      return 'This challenge is full.';
    }
    if (challenge.is_official && !hasCompletedBodyMetrics(profile)) {
      return BODY_METRICS_JOIN_COPY;
    }
    const buyIn = Number(challenge.buy_in_amount) || 0;
    const held = walletBalance(profile, challenge.currency);
    if (buyIn > 0 && profile && held < buyIn && !isBucksChallenge(challenge)) {
      return `You need ${formatWalletAmount(buyIn, challenge.currency)} to join. You have ${formatWalletAmount(held, challenge.currency)}.`;
    }
    return null;
  }, [challenge, isHost, isJoined, profile]);

  const canJoinBase = Boolean(challenge) && !isJoined && !isHost && !joinBlocked;
  const needsBodyMetrics = joinBlocked === BODY_METRICS_JOIN_COPY;
  const joinCta = bucksJoinCta({
    currency: challenge?.currency,
    buyIn: Math.max(Number(challenge?.buy_in_amount) || 0, 0),
    wallet: walletBalance(profile, challenge?.currency),
    hasProfile: Boolean(profile),
  });
  const needsTopUp =
    Boolean(challenge) &&
    joinCta.needsTopUp &&
    !isJoined &&
    !isHost &&
    !needsBodyMetrics &&
    !joinBlocked;
  const canJoin = canJoinBase && !joinCta.needsTopUp;
  const wasCancelled = challenge?.status === 'cancelled';

  useEffect(() => {
    if (fundedParam !== '1') {
      return;
    }
    void refetchProfile();
  }, [fundedParam, refetchProfile]);

  useEffect(() => {
    if (!needsBodyMetrics) {
      return;
    }
    void supabase.rpc('notify_my_profile_gate', { p_missing: 'physical details' });
  }, [needsBodyMetrics]);
  const watch = useStartOnWatch(challenge);
  const inviteOnly = isInviteOnlyChallenge(challenge);
  const windowEnded = Boolean(challenge && hasChallengeEnded(challenge, new Date(nowMs)));
  const judgingHold =
    Boolean(challenge) &&
    windowEnded &&
    challenge?.status !== 'settled' &&
    challenge?.status !== 'cancelled' &&
    !isDistributeGateOpen(challenge ?? {}, new Date(nowMs));

  const waitingToStart = Boolean(
    challenge && !hasChallengeStarted(challenge, new Date(nowMs)),
  );
  const officialLiveClock = Boolean(
    challenge && isOfficialSeriesChallenge(challenge) && challenge.status === 'live',
  );

  useEffect(() => {
    if (!judgingHold && !waitingToStart && !officialLiveClock) {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [judgingHold, waitingToStart, officialLiveClock]);

  const scrollRef = useRef<ScrollView>(null);
  const lastFocusFetchAt = useRef(Date.now());
  const refetchChallenge = useRef(challengeQuery.refetch);
  const refetchRoster = useRef(roster.refetch);
  refetchChallenge.current = challengeQuery.refetch;
  refetchRoster.current = roster.refetch;

  useEffect(() => {
    lastFocusFetchAt.current = Date.now();
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      if (!id) {
        return;
      }
      if (loggedParam) {
        scrollRef.current?.scrollTo({ y: 0, animated: false });
      }
      const now = Date.now();
      if (now - lastFocusFetchAt.current < 8000) {
        return;
      }
      lastFocusFetchAt.current = now;
      void refetchChallenge.current();
      void refetchRoster.current();
    }, [id, loggedParam]),
  );

  const refreshing =
      (challengeQuery.isRefetching ||
      feed.isRefetching ||
      roster.isFetching ||
      periodCheckin.isRefetching ||
      submittedCheckins.isRefetching ||
      completions.isRefetching ||
      settlementQuery.isRefetching) &&
    !challengeQuery.isLoading;

  if (challengeQuery.isLoading) {
    return (
      <Screen>
        <Stack.Screen
          options={{
            title: 'Challenge',
            headerBackVisible: false,
            headerLeft: () => <StackBackButton />,
            headerRight: () => <ChallengeDetailHeaderRight />,
          }}
        />
        <MascotState
          kind="loading"
          title="Loading challenge"
          body="Pulling rules, pool, and competitors."
        />
      </Screen>
    );
  }

  if (!challenge) {
    const blocked = String(challengeQuery.error?.message ?? '').includes(copy('geo.unavailable'));
    return (
      <Screen>
        <Stack.Screen
          options={{
            title: 'Challenge',
            headerBackVisible: false,
            headerLeft: () => <StackBackButton />,
            headerRight: () => <ChallengeDetailHeaderRight />,
          }}
        />
        <MascotState
          kind="error"
          title={blocked ? copy('geo.unavailable') : copy('challenge.notFound')}
          body={blocked ? undefined : challengeQuery.error?.message ?? 'This blob wandered off.'}
          actionLabel="Retry"
          onAction={() => void challengeQuery.refetch()}
        />
      </Screen>
    );
  }

  function onJoinPress() {
    if (joinSheet.loading || !challenge || isHost || isJoined || !canJoinBase) {
      return;
    }
    if (needsBodyMetrics) {
      router.push(BODY_METRICS_HREF);
      return;
    }
    setActionError(null);
    joinSheet.open(challenge);
  }

  function onJudgePress() {
    if (markJudging.isPending || settle.isPending) {
      return;
    }
    setActionError(null);
    setJudgeOpen(true);
  }

  function onConfirmJudge() {
    if (!id || markJudging.isPending) {
      return;
    }
    setActionError(null);
    markJudging.mutate(id, {
      onSuccess: () => setJudgeOpen(false),
      onError: (error) => {
        setActionError(getErrorMessage(error));
      },
    });
  }

  function onSettlePress() {
    if (settle.isPending || markJudging.isPending) {
      return;
    }
    if (!challenge || !isDistributeGateOpen(challenge)) {
      setActionError('Payout unlocks 1 hour after the challenge ends.');
      return;
    }
    setActionError(null);
    setSettleOpen(true);
  }

  function onConfirmSettle() {
    if (!id || settle.isPending) {
      return;
    }
    setActionError(null);
    settle.mutate(id, {
      onSuccess: () => setSettleOpen(false),
      onError: (error) => {
        setActionError(getErrorMessage(error));
      },
    });
  }

  async function onRefresh() {
    await Promise.all([
      challengeQuery.refetch(),
      feed.refetch(),
      periodCheckin.refetch(),
      submittedCheckins.refetch(),
      completions.refetch(),
      roster.refetch(),
      settlementQuery.refetch(),
    ]);
  }

  const proofSteps = requiredChallengeProofs(challenge);
  const isPoints = isPointsChallenge(challenge);
  const isUnlimited = isUnlimitedChallenge(challenge);
  const ruleCopy = challengeRuleCopy(challenge);
  const target = durationDays;
  const checkinTarget = challengeTargetCount(challenge);
  const logTitle = periodCheckin.data?.ctaTitle ?? copy('checkin.begin');
  const proofHeadline =
    proofSteps.length === 1
      ? 'Proof for every check-in'
      : `${proofSteps.length} proofs every check-in`;
  const buyInAmount = Math.max(Number(challenge.buy_in_amount) || 0, 0);
  const bucks = isBucksChallenge(challenge);
  const logsClosed = isClosedForLogs({
    ...challenge,
    eliminated: Boolean(participation?.eliminated_at),
  });
  const settlement = settlementQuery.data;
  const finishers = completerCount(roster.data ?? [], checkinTarget);
  const payoutAt = distributableAt(challenge);
  const gateOpen = isDistributeGateOpen(challenge, new Date(nowMs));
  const showJudgingUi =
    !isUnlimited &&
    hasChallengeEnded(challenge, new Date(nowMs)) &&
    challenge.status !== 'settled' &&
    challenge.status !== 'cancelled';
  const canJudge = canMarkJudging(challenge, user?.id, new Date(nowMs)) && !settlement;
  const canSettle = canSettleChallenge(challenge, user?.id) && !settlement;
  const receipt =
    settlement ??
    (challenge.status === 'settled'
      ? {
          already_settled: true,
          settlement: {
            id: challenge.id,
            challenge_id: challenge.id,
            settled_by: null,
            prize_pool: Number(challenge.prize_pool ?? 0),
            distributed: 0,
            prize_structure: challenge.prize_structure ?? 'equal_split',
            winner_count: 0,
            settled_at: challenge.distributed_at ?? challenge.updated_at,
          },
          payouts: [],
        }
      : null);

  const signupLines = signupProofLines(challenge);
  const hideBuyIn =
    buyInAmount > 0 && (isBucksChallenge(challenge) || Boolean(challenge.host_funded));
  const startNeeded = userStartNeededLabel(challenge, competitorCount);
  const remainingNow = competitorCount;
  const goalLabel = challengeGoalLabel(challenge, {
    daysCompleted,
    taskCount: Math.max(challenge.tasks?.length ?? 0, 1),
  });
  const prizeForfeited =
    remainingNow <= 0 &&
    (Number(challenge.participant_count) > 0 || Number(challenge.eliminated_count) > 0);
  const progressRatio = isUnlimited
    ? 1
    : daysCompleted / Math.max(isPoints ? Math.max(challenge.tasks.length, 1) : target, 1);
  const startLine =
    waitingToStart
      ? startsInLabel(challenge, new Date(nowMs)) ??
        userStartNeededLabel(challenge, competitorCount) ??
        copy('challenge.waitingToStart')
      : null;
  const stickyJoin = !isJoined && (needsBodyMetrics || canJoin || needsTopUp);
  const stickyCheckin =
    isJoined &&
    challenge.status === 'live' &&
    !participation?.eliminated_at &&
    !waitingToStart &&
    !logsClosed;
  const showStickyCta =
    challenge.status !== 'settled' &&
    challenge.status !== 'cancelled' &&
    (stickyJoin || stickyCheckin);
  const tabClearance = tabBarLift(insets.bottom, 'sticky');
  const stickyBlock = showStickyCta ? JOIN_CTA_HEIGHT + 12 : 0;

  return (
    <ChallengeNotesProvider>
    <Screen padded={false} edges={['left', 'right']}>
      <Stack.Screen
        options={{
          title: challenge.title,
          headerBackVisible: false,
          headerLeft: () => <StackBackButton />,
          headerRight: () => <ChallengeDetailHeaderRight />,
        }}
      />
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="px-4"
        contentContainerStyle={{ paddingBottom: tabClearance + stickyBlock + 16 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={THEME.accent}
          />
        }
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        keyboardDismissMode="interactive"
        showsVerticalScrollIndicator={false}>
        <View style={{ marginTop: 8 }}>
          <ChallengeHeroCard
            challenge={challenge}
            host={hostQuery.data}
            viewerId={user?.id}
            joined={isJoined}
            hosting={isHost && !isJoined}
            invited={inviteOnly && !isHost && !isJoined}
            showNotJoined={!isJoined && !isHost}
            goalLabel={goalLabel}
            daysCompleted={daysCompleted}
            progressRatio={progressRatio}
            nowMs={nowMs}
            showProgressRing={isJoined}
            cancelled={wasCancelled}
            onInvite={openInvite}>
            {!wasCancelled &&
            !isOfficialJoinable(challenge) &&
            challenge.status !== 'settled' ? (
              <Button
                title="Share"
                variant="outline"
                size="sm"
                onPress={openInvite}
              />
            ) : null}
          </ChallengeHeroCard>
        </View>
        {startLine ? (
          <AppText className="mt-2 text-[13px] leading-5 text-muted">{startLine}</AppText>
        ) : null}

        {isJoined &&
        !loggedToday &&
        (checkinPhase === 'in_progress' || checkinPhase === 'ready') &&
        isOfficialSeriesChallenge(challenge) &&
        challenge.status === 'live' ? (
          <View
            className="mt-4 rounded-blob px-4 py-3"
            style={{ backgroundColor: THEME.accentSoft }}>
            <AppText className="text-[14px] font-semibold" style={{ color: THEME.accent }}>
              {copy('checkin.submitBanner')}
            </AppText>
          </View>
        ) : null}

        {receipt ? (
          <View className="mt-4">
            <SettlementSummary
              settlement={receipt}
              userId={user?.id}
              joined={isJoined}
              daysCompleted={daysCompleted}
              targetCount={target}
              currency={challenge.currency}
              official={challenge.is_official}
            />
          </View>
        ) : null}

        {showOfficialTools ? (
          <View className="mt-4">
            <Button
              title="Official tools"
              variant="outline"
              onPress={() => router.push(`/challenges/${id}/official`)}
            />
          </View>
        ) : null}

        {challenge.is_official ? (
          <>
            <ChallengeDetailsCard challenge={challenge} />
            {isOfficialJoinable(challenge) ? null : (
              <View className="mt-4">
                <OfficialMoneyBoard
                  challenge={challenge}
                  finished={finishers}
                  onInvite={openInvite}
                />
              </View>
            )}
          </>
        ) : null}

        {challenge.is_official ? null : signupLines.length > 0 || isPoints ? (
          <Card className="mt-4">
            <AppText
              className="text-[11px] font-semibold uppercase tracking-widest"
              style={{ color: THEME.textPrimary }}>
              What you’re signing up for
            </AppText>
            {signupLines.length > 0 ? (
              <View className="mt-2 gap-2">
                {signupLines.map((line, index) => (
                  <AppText
                    key={`${index}-${line}`}
                    className="text-[14px] leading-6"
                    style={{ color: THEME.textPrimary }}>
                    {line}
                  </AppText>
                ))}
              </View>
            ) : null}
            {isPoints ? (
              <View className="mt-3 gap-2.5">
                {challenge.tasks.map((task, index) => (
                  <View key={task.id} className="flex-row gap-3">
                    <View
                      className="h-6 w-6 items-center justify-center rounded-full"
                      style={{ backgroundColor: THEME.accentSoft }}>
                      <AppText className="text-[12px] font-bold" style={{ color: THEME.accent }}>
                        {index + 1}
                      </AppText>
                    </View>
                    <View className="flex-1">
                      <AppText className="font-semibold text-charcoal">{task.title}</AppText>
                      <AppText className="text-[13px] leading-5 text-muted">
                        {task.points} pts{task.proof_required ? ' · proof required' : ''}
                      </AppText>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}
          </Card>
        ) : null}

        <View className="mt-4">
          <ChallengeLeaderboard
            challenge={challenge}
            roster={boardRoster}
            completedUserIds={completions.data ?? new Set()}
            joined={isJoined}
          />
        </View>

        {startNeeded ? (
          <Card className="mt-4">
            <FieldNoteLabel
              note="startNeeded"
              textClassName="text-[11px] font-semibold uppercase tracking-widest text-muted">
              Start
            </FieldNoteLabel>
            <AppText className="mt-1 leading-6 text-charcoal">{startNeeded}</AppText>
          </Card>
        ) : null}

        <Card className="mt-4 gap-3">
          <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Mechanics
          </AppText>
          {hideBuyIn ? null : (
            <View>
              <FieldNoteLabel
                note={entryFieldNote(challenge)}
                textClassName="text-[11px] font-semibold uppercase tracking-widest text-muted">
                {buyInAmount <= 0 ? 'Entry' : 'Entry fee'}
              </FieldNoteLabel>
              <View className="mt-1">
                <StakeAmount
                  amount={buyInAmount}
                  currency={challenge.currency}
                  size={18}
                  freeLabel={copy('create.free')}
                  textClassName="text-xl font-bold text-charcoal"
                />
              </View>
            </View>
          )}
          <View>
            <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              {isPoints ? 'Task points' : isUnlimited ? 'Stay eligible' : 'To finish'}
            </AppText>
            <AppText className="mt-1 text-xl font-bold text-charcoal">
              {isPoints
                ? `${totalTaskPoints(challenge.tasks)} pts`
                : challenge.is_official
                  ? challengeGoalLabel(challenge)
                  : ruleCopy.toFinish || challenge.task?.trim() || ruleCopy.cadenceLong}
            </AppText>
          {isPoints || isUnlimited || challenge.is_official || !ruleCopy.totalHint ? null : (
              <AppText className="mt-1 text-xs leading-4 text-muted">{ruleCopy.totalHint}</AppText>
            )}
          </View>
          {isPoints ? null : (
            <View>
              <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                {proofHeadline}
              </AppText>
              <View className="mt-2 gap-2.5">
                {proofSteps.map((proof, index) => (
                  <View key={proof.id} className="flex-row gap-3">
                    <View
                      className="h-6 w-6 items-center justify-center rounded-full"
                      style={{ backgroundColor: THEME.accentSoft }}>
                      <AppText className="text-[12px] font-bold" style={{ color: THEME.accent }}>
                        {index + 1}
                      </AppText>
                    </View>
                    <View className="flex-1">
                      <AppText className="font-semibold text-charcoal">{proofDisplayName(proof)}</AppText>
                      {proof.method === 'hr' &&
                      periodCheckin.data?.proof_parts?.[proof.id]?.healthWorkoutId ? (
                        <HealthProofCaption
                          healthWorkoutId={periodCheckin.data.proof_parts[proof.id].healthWorkoutId}
                        />
                      ) : (
                        <AppText className="text-[13px] leading-5 text-muted">
                          {proof.method === 'honor' ? 'Honor. Confirm to check in.' : methodLabel(proof.method)}
                        </AppText>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </Card>

        {challenge.is_official ? null : (
        <Card className="mt-4">
          <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Rules
          </AppText>
          {isPoints ? null : ruleCopy.primary ? (
            <AppText className="mt-2 leading-6 text-ink">{ruleCopy.primary}</AppText>
          ) : null}
          {isPoints ? null : ruleCopy.extras.length > 0 ? (
            <View className="mt-3 gap-2">
              {ruleCopy.extras.map((line, index) => (
                <RuleLine key={`${index}-${line}`} text={line} />
              ))}
            </View>
          ) : null}
          {isPoints || !ruleCopy.totalHint ? null : (
            <AppText className="mt-2 text-sm leading-5 text-muted">{ruleCopy.totalHint}</AppText>
          )}
          {isUnlimited ? (
            <View className="mt-3">
              <RuleLine text={lastManStandingRequirement(challenge)} />
            </View>
          ) : null}
          {challenge.rules_video_url ? (
            <Pressable
              onPress={() => void Linking.openURL(challenge.rules_video_url!)}
              accessibilityRole="link"
              accessibilityLabel="Open rules video"
              className="mt-3"
              style={{ minHeight: 44, justifyContent: 'center' }}>
              <AppText className="font-semibold text-charcoal underline">Watch the rules</AppText>
            </Pressable>
          ) : null}
        </Card>
        )}

        {wasCancelled || challenge.is_official ? null : (
        <Card className="mt-4">
          <FieldNoteLabel
            note="pot"
            textClassName="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Prize
          </FieldNoteLabel>
          {prizeForfeited ? (
            <AppText className="mt-2 text-[17px] font-semibold leading-6 text-charcoal">
              Stakes forfeited, no refund.
            </AppText>
          ) : (
            <View className="mt-2">
              <ChallengePrizeLine challenge={challenge} />
            </View>
          )}
        </Card>
        )}

        {isHost && inviteOnly && challenge.status !== 'settled' && !wasCancelled ? (
          <ChallengeInvitesCard
            challengeId={challenge.id}
            onInvitePerson={openInvite}
          />
        ) : null}

        <View className="mt-5">
          {challenge.status === 'settled' || challenge.status === 'cancelled' ? null : isHost &&
            showJudgingUi ? (
            <Card className="mb-3 gap-3">
              <AppText className="font-semibold text-charcoal">Judging</AppText>
              <AppText className="text-sm leading-5 text-muted">
                {gateOpen
                  ? `The 1 hour hold is done. Distribute ${bucks ? '$' : 'Coins'} to completers. This can only happen once.`
                  : `Results locked · payout after 1h hold${
                      payoutAt
                        ? ` · ${payoutCountdownLabel(payoutAt, new Date(nowMs))} left`
                        : ''
                    }.`}
              </AppText>
              {actionError && !judgeOpen && !settleOpen ? (
                <AppText className="text-sm leading-5 text-coral-dark">{actionError}</AppText>
              ) : null}
              {canJudge ? (
                <Button
                  title="Lock results"
                  size="lg"
                  loading={markJudging.isPending}
                  onPress={onJudgePress}
                />
              ) : null}
              {canSettle ? (
                <Button
                  title="Distribute prizes"
                  size="lg"
                  loading={settle.isPending}
                  disabled={!gateOpen}
                  onPress={onSettlePress}
                />
              ) : null}
            </Card>
          ) : showJudgingUi ? (
            <Card className="mb-3">
              <AppText className="font-semibold text-charcoal">Judging</AppText>
              <AppText className="mt-1 text-sm leading-5 text-muted">
                Results locked · payout after 1h hold
                {payoutAt && !gateOpen
                  ? ` · ${payoutCountdownLabel(payoutAt, new Date(nowMs))} left`
                  : ''}
                .
              </AppText>
            </Card>
          ) : null}
        </View>

        <AppText className="mt-8 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
          Challenge feed
        </AppText>
        <AppText className="mt-1 mb-4 text-xl font-bold text-charcoal">
          Posts from this challenge
        </AppText>
        <FeedList
          embedded
          posts={feed.data ?? []}
          isLoading={feed.isLoading}
          error={feed.error instanceof Error ? feed.error.message : null}
          highlightPostId={highlightPostId}
          currentUserId={user?.id}
          emptyTitle="Quiet in this challenge"
          emptyBody={
            isJoined
              ? participation?.eliminated_at
                ? 'You’re out, but you can still watch the check-ins.'
                : copy('checkin.emptyBob')
              : 'Join the challenge to post in this feed.'
          }
          composerPlaceholder="How’s the work going?"
          hideAudience
          composeSource="challenge"
          canCompose={isJoined && !participation?.eliminated_at}
          composing={createPost.isPending}
          commenting={createComment.isPending}
          onRetry={() => void feed.refetch()}
          onCompose={(input) => createPost.mutateAsync(input)}
          onReact={(post, type, commentId) => toggleReaction.mutate({ post, type, commentId })}
          onComment={(post, content, parentId, mentionedUserIds) =>
            createComment.mutateAsync({ postId: post.id, content, parentId, mentionedUserIds })
          }
        />
      </ScrollView>

      {showStickyCta ? (
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: tabClearance,
          zIndex: 20,
          paddingHorizontal: 16,
        }}>
        {stickyJoin ? (
          <View className="gap-1.5">
            {actionError ? (
              <AppText className="text-center text-sm leading-5 text-coral-dark">{actionError}</AppText>
            ) : null}
            {needsBodyMetrics ? (
              <Button
                title="Add body metrics"
                size="md"
                onPress={() => router.push(BODY_METRICS_HREF)}
              />
            ) : needsTopUp ? (
              <Button
                title={joinCta.topUpLabel}
                size="md"
                loading={joinSheet.loading}
                onPress={onJoinPress}
              />
            ) : (
              <JoinCtaButton
                currency={challenge.currency}
                amount={buyInAmount}
                loading={joinSheet.loading}
                onPress={onJoinPress}
              />
            )}
          </View>
        ) : periodCheckin.isLoading ? (
          <Button title="Checking today’s check-in" size="md" loading disabled />
        ) : (
          <View className="gap-1.5">
            <Button
              title={loggedToday ? copy('checkin.checkedIn') : logTitle}
              size="md"
              variant={loggedToday ? 'outline' : 'primary'}
              disabled={loggedToday}
              onPress={() => {
                if (loggedToday) {
                  return;
                }
                router.push(`/challenges/${id}/submit`);
              }}
            />
            {!loggedToday && watch.visible ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={copy('health.startWatch')}
                disabled={watch.busy}
                onPress={() => {
                  void watch.start().then((result) => {
                    if (result === 'ok') {
                      setWatchToast(copy('health.startedWatch'));
                    } else if (result === 'denied' || result === 'failed') {
                      setWatchToast(copy('health.startWatchFail'));
                    }
                    if (result !== 'cancelled') {
                      setTimeout(() => setWatchToast(null), 2400);
                    }
                  });
                }}
                style={{ minHeight: 36, alignItems: 'center', justifyContent: 'center' }}>
                <AppText className="text-[15px] font-semibold" style={{ color: THEME.accent }}>
                  {copy('health.startWatch')}
                </AppText>
              </Pressable>
            ) : null}
            {watchToast ? (
              <AppText className="text-center text-sm text-muted">{watchToast}</AppText>
            ) : null}
          </View>
        )}
      </View>
      ) : null}

      <SettleConfirmModal
        visible={judgeOpen}
        challenge={challenge}
        loading={markJudging.isPending}
        error={actionError}
        mode="judge"
        onClose={() => setJudgeOpen(false)}
        onConfirm={onConfirmJudge}
      />
      <SettleConfirmModal
        visible={settleOpen}
        challenge={challenge}
        loading={settle.isPending}
        error={actionError}
        mode="settle"
        completerCount={finishers}
        onClose={() => setSettleOpen(false)}
        onConfirm={onConfirmSettle}
      />
    </Screen>
    </ChallengeNotesProvider>
  );
}

function RuleLine({ text }: { text: string }) {
  return (
    <View className="flex-row gap-2">
      <AppText style={{ color: THEME.accent }}>●</AppText>
      <AppText className="flex-1 leading-6 text-ink">{text}</AppText>
    </View>
  );
}
