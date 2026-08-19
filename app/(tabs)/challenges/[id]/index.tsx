import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchPublicProfilesByIds } from '@/lib/social';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BucksTag } from '@/components/currency/BucksTag';
import { BuckUsdAmount, CurrencyMark } from '@/components/currency/CurrencyMark';
import { FeedList } from '@/components/feed/FeedList';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { ChallengeInvitesCard } from '@/components/challenge/ChallengeInvitesCard';
import { ChallengeLeaderboard } from '@/components/challenge/ChallengeLeaderboard';
import { OfficialDayClock } from '@/components/challenge/OfficialDayClock';
import { OfficialMoneyBoard } from '@/components/challenge/OfficialMoneyBoard';
import { ChallengeDetailHeaderRight } from '@/components/challenge/ChallengeDetailOverflow';
import { InviteToChallengeModal } from '@/components/challenge/InviteToChallengeModal';
import { JoinConfirmModal } from '@/components/challenge/JoinConfirmModal';
import { SettleConfirmModal } from '@/components/challenge/SettleConfirmModal';
import { SettlementSummary } from '@/components/challenge/SettlementSummary';
import { MascotState } from '@/components/mascot/MascotState';
import { StackBackButton, useDismissTo } from '@/components/navigation/StackBackButton';
import { BODY_METRICS_HREF, LOBBY_HREF } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import {
  useChallenge,
  useChallengeParticipants,
  useChallengeSettlement,
  useJoinChallenge,
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
import { useLoggedWorkoutCount, usePeriodCompletions, useTodaySubmission } from '@/hooks/useWorkoutSubmission';
import { methodLabel, proofDisplayName } from '@/lib/challengeProofs';
import { challengeRuleCopy } from '@/lib/challengeRuleCopy';
import {
  challengeTargetCount,
  countLiveCompetitors,
  isChallengeFull,
  isPointsChallenge,
  isUnlimitedChallenge,
  lastManStandingRequirement,
  prizeStructureSummary,
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
} from '@/lib/settlement';
import {
  armingCountdownLabel,
  isOfficialJoinable,
  isOfficialSeriesChallenge,
  officialAlreadyStartedCopy,
} from '@/lib/officialSeries';
import { healthProofLines } from '@/lib/health/proofSummary';
import { fetchHealthWorkoutById } from '@/lib/health/remote';
import { isInviteOnlyChallenge } from '@/lib/challengeLane';
import { formatWallet, isBucksChallenge, isSponsoredBucks, walletBalance } from '@/lib/currency';
import { hasCompletedBodyMetrics } from '@/lib/bodyMetrics';
import { shareOfficialChallenge } from '@/lib/officialShare';
import { tabBarLift, THEME, themeShadow } from '@/lib/theme';
import { copy } from '@/lib/copy';
import { officialBob } from '@/copy/officialBob';
import { CHALLENGE_STATUS_LABEL } from '@/lib/constants';
import { getErrorMessage } from '@/utils/errors';
import {
  challengeTimingLabel,
  formatDateRange,
} from '@/utils/format';

const BODY_METRICS_JOIN_COPY =
  'Missing: physical details. Official Challenges need them for matching — they stay private.';

export default function ChallengeDetailScreen() {
  const params = useLocalSearchParams<{ id: string; returnTo?: string; logged?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const loggedParam = Array.isArray(params.logged) ? params.logged[0] : params.logged;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  useDismissTo(returnTo === 'feed' ? '/feed' : LOBBY_HREF);
  const { user } = useAuth();
  const { profile } = useMyProfile();
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
  const todaySubmission = useTodaySubmission(id, challengeQuery.data);
  const healthProofId = todaySubmission.data?.health_workout_id;
  const healthProofQuery = useQuery({
    queryKey: ['health-proof', healthProofId],
    enabled: Boolean(healthProofId) && todaySubmission.data?.proof_kind === 'health_workout',
    queryFn: () => fetchHealthWorkoutById(healthProofId!),
  });
  const loggedCount = useLoggedWorkoutCount(id);
  const completions = usePeriodCompletions(id, challengeQuery.data);
  const join = useJoinChallenge();
  const markJudging = useMarkChallengeJudging();
  const settle = useSettleChallenge();
  const settlementQuery = useChallengeSettlement(id);
  const feed = useFeed(id);
  const createPost = useCreatePost(id);
  const createComment = useCreateComment(id);
  const toggleReaction = useToggleReaction();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [judgeOpen, setJudgeOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [watchToast, setWatchToast] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const challenge = challengeQuery.data;
  const participation = useMemo(
    () => roster.data?.find((row) => row.user_id === user?.id) ?? null,
    [roster.data, user?.id],
  );
  const isJoined = Boolean(participation);
  const competitorCount = useMemo(() => {
    if (!roster.data) {
      return Math.max(Number(challenge?.participant_count) || 0, isJoined ? 1 : 0);
    }
    return countLiveCompetitors(roster.data);
  }, [challenge?.participant_count, isJoined, roster.data]);
  const daysRequired = challengeTargetCount(challenge);
  const loggedToday = Boolean(todaySubmission.data);
  const healthProofLinesView = useMemo(() => {
    const row = healthProofQuery.data;
    if (!row) {
      return null;
    }
    return healthProofLines({
      activityLabel: row.activity_label,
      durationSec: row.duration_sec,
      confidence: row.confidence,
      hrAvg: row.hr_avg,
      caloriesKcal: row.calories_kcal,
    });
  }, [healthProofQuery.data]);
  const daysCompleted = Math.max(
    Number(participation?.days_completed ?? 0),
    loggedCount.data ?? 0,
  );

  const joinBlocked = useMemo(() => {
    if (!challenge || isJoined) {
      return null;
    }
    if (challenge.status === 'settled' || challenge.status === 'judging' || challenge.status === 'cancelled_underfilled' || challenge.status === 'cancelled') {
      return 'This challenge is no longer accepting competitors.';
    }
    if (!isJoinWindowOpen(challenge)) {
      if (challenge.series_id || challenge.is_official) {
        return officialAlreadyStartedCopy();
      }
      if (challenge.starts_at && new Date() >= new Date(challenge.starts_at)) {
        return 'Join closed when this challenge started.';
      }
      return 'This challenge is no longer accepting competitors.';
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
    const wallet = walletBalance(profile, challenge.currency);
    if (buyIn > 0 && profile && wallet < buyIn) {
      return `You need ${formatWallet(buyIn, challenge.currency)} to buy in. You have ${formatWallet(wallet, challenge.currency)}.`;
    }
    return null;
  }, [challenge, isJoined, profile]);

  const canJoin = Boolean(challenge) && !isJoined && !joinBlocked;
  const needsBodyMetrics = joinBlocked === BODY_METRICS_JOIN_COPY;
  const isHost = Boolean(challenge && user?.id && challenge.created_by === user.id);
  const wasCancelled = challenge?.status === 'cancelled';

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
      todaySubmission.isRefetching ||
      loggedCount.isRefetching ||
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

  if (challengeQuery.error || !challenge) {
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
    if (join.isPending) {
      return;
    }
    setActionError(null);
    setConfirmOpen(true);
  }

  function onConfirmJoin() {
    if (!id || join.isPending) {
      return;
    }
    setActionError(null);
    join.mutate(id, {
      onSuccess: () => setConfirmOpen(false),
      onError: (error) => {
        setActionError(getErrorMessage(error));
      },
    });
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
      todaySubmission.refetch(),
      loggedCount.refetch(),
      roster.refetch(),
      settlementQuery.refetch(),
    ]);
  }

  const proofSteps = requiredChallengeProofs(challenge);
  const isFitness = (challenge.category ?? 'fitness') === 'fitness';
  const isPoints = isPointsChallenge(challenge);
  const isUnlimited = isUnlimitedChallenge(challenge);
  const ruleCopy = challengeRuleCopy(challenge);
  const target = daysRequired;
  const logTitle = isPoints
    ? 'Log progress'
    : isFitness
      ? 'Log today’s workout'
      : 'Log today’s proof';
  const proofHeadline =
    proofSteps.length === 1
      ? 'Proof for every log'
      : `${proofSteps.length} proofs every log`;
  const prizeCopy = prizeStructureSummary(challenge);
  const buyInAmount = Math.max(Number(challenge.buy_in_amount) || 0, 0);
  const isFreeEntry = buyInAmount <= 0;
  const bucks = isBucksChallenge(challenge);
  const money = (amount: number) => formatWallet(amount, challenge.currency);
  const structure = challenge.prize_structure;
  const logsClosed = isClosedForLogs({
    ...challenge,
    eliminated: Boolean(participation?.eliminated_at),
  });
  const settlement = settlementQuery.data;
  const finishers = completerCount(roster.data ?? [], challenge.days_required ?? target);
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

  const taskCopy = (challenge.task?.trim() || challenge.description?.trim()) || '';
  const hideBuyIn = isBucksChallenge(challenge) || Boolean(challenge.host_funded);
  const remainingNow = competitorCount;
  const goalLabel = heroGoalLabel({
    daysCompleted,
    target,
    isPoints,
    isUnlimited,
    period: ruleCopy.period,
    periodCount: ruleCopy.count,
    taskCount: Math.max(challenge.tasks?.length ?? 0, 1),
  });
  const prizeLine = challenge.is_official
    ? remainingNow <= 0 &&
      (Number(challenge.participant_count) > 0 || Number(challenge.eliminated_count) > 0)
      ? officialBob('legalZero')
      : officialBob('cardSplit')
    : remainingNow <= 0 &&
        (Number(challenge.participant_count) > 0 || Number(challenge.eliminated_count) > 0)
      ? 'Stakes forfeited, no refund.'
      : structure === 'equal_split' || !structure
        ? `${money(Number(challenge.prize_pool))} ÷ ${remainingNow} remaining if they finish.`
        : prizeCopy;
  const progressRatio = isUnlimited
    ? 1
    : daysCompleted / Math.max(isPoints ? Math.max(challenge.tasks.length, 1) : target, 1);
  const scheduleLine = isUnlimited
    ? 'Ongoing · Last man standing'
    : isOfficialJoinable(challenge)
      ? challenge.status === 'arming'
        ? armingCountdownLabel(challenge.armed_at, new Date(nowMs)) ?? '7 days'
        : '7 days · Open to join'
      : `${challengeTimingLabel(challenge.starts_at, challenge.ends_at)} · ${formatDateRange(challenge.starts_at, challenge.ends_at)}`;
  const showStickyCta =
    challenge.status !== 'settled' &&
    challenge.status !== 'cancelled' &&
    (isJoined || challenge.status !== 'judging');

  return (
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
        contentContainerClassName="px-4 pb-4"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={THEME.accent}
          />
        }
        showsVerticalScrollIndicator={false}>
        <LinearGradient
          colors={['#2C9B89', '#10201D']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{
            marginTop: 8,
            borderRadius: 24,
            overflow: 'hidden',
            ...themeShadow('card'),
          }}>
          {challenge.cover_image_url ? (
            <Image
              source={{ uri: challenge.cover_image_url }}
              style={{
                position: 'absolute',
                top: 0,
                right: 0,
                bottom: 0,
                left: 0,
                opacity: 0.18,
              }}
              contentFit="cover"
              cachePolicy="memory-disk"
              accessibilityLabel={`${challenge.title} cover`}
            />
          ) : null}
          <View className="gap-3 p-4">
            <View className="flex-row flex-wrap gap-1.5">
              {isBucksChallenge(challenge) && !isOfficialJoinable(challenge) ? (
                <BucksTag challenge={challenge} />
              ) : null}
              {challenge.is_official ? (
                <HeroChip
                  label={isSponsoredBucks(challenge) ? 'Sponsored' : 'Official'}
                  dark
                />
              ) : null}
              {challenge.visibility === 'private' || challenge.visibility === 'invite' ? (
                <HeroChip label="Private" />
              ) : (
                <HeroChip label="Public" />
              )}
              {isHost && !isJoined ? <HeroChip label="Hosting" dark /> : null}
              {isJoined ? <HeroChip label="Joined" mint /> : null}
              {inviteOnly && !isHost && !isJoined ? <HeroChip label="Invited" /> : null}
              <HeroChip label={isPoints ? 'Points' : 'Consistency'} mint />
              {isUnlimited ? <HeroChip label="Last man standing" dark /> : null}
              <HeroChip
                label={
                  showJudgingUi
                    ? 'Judging'
                    : (CHALLENGE_STATUS_LABEL[challenge.status] ?? challenge.status)
                }
              />
            </View>
            <AppText
              className="text-[24px] font-extrabold leading-7"
              style={{ color: '#fff' }}
              numberOfLines={2}>
              {challenge.title}
            </AppText>
            {hostQuery.data ? (
              <ProfileLink username={hostQuery.data.username} userId={hostQuery.data.id}>
                <AppText className="text-[13px]" style={{ color: 'rgba(255,255,255,0.78)' }}>
                  Hosted by{' '}
                  <AppText className="font-semibold" style={{ color: '#fff' }}>
                    {hostQuery.data.display_name ?? hostQuery.data.username}
                  </AppText>
                </AppText>
              </ProfileLink>
            ) : null}
            {isOfficialSeriesChallenge(challenge) ? (
              <OfficialDayClock challenge={challenge} now={new Date(nowMs)} variant="hero" />
            ) : (
              <AppText className="text-[13px]" style={{ color: 'rgba(255,255,255,0.78)' }} numberOfLines={1}>
                {scheduleLine}
              </AppText>
            )}
            {wasCancelled ? (
              <AppText className="text-[15px] font-semibold" style={{ color: '#fff' }}>
                {copy('challenge.cancelled')}
              </AppText>
            ) : null}
            <View className="flex-row items-center justify-between gap-3">
              <View className="min-w-0 flex-1">
                {wasCancelled ? null : (
                  <>
                <AppText
                  className="text-[11px] font-semibold uppercase"
                  style={{ color: 'rgba(255,255,255,0.62)', letterSpacing: 0.6 }}>
                  Current pool
                </AppText>
                <View className="mt-1 flex-row items-center">
                  {isOfficialJoinable(challenge) ? (
                    <BuckUsdAmount
                      amount={Number(challenge.prize_pool)}
                      size={18}
                      textClassName="text-[22px] font-extrabold"
                      color="#fff"
                    />
                  ) : (
                    <>
                      <CurrencyMark currency={challenge.currency} size={18} />
                      <AppText className="ml-1.5 text-[22px] font-extrabold" style={{ color: '#fff' }}>
                        {money(Number(challenge.prize_pool))}
                      </AppText>
                    </>
                  )}
                </View>
                  </>
                )}
                {isHost && !inviteOnly && challenge.status !== 'settled' && !wasCancelled ? (
                  <View className="mt-3 self-start">
                    <Button
                      title="Invite someone"
                      variant="outline"
                      size="sm"
                      onPress={() => setInviteOpen(true)}
                    />
                  </View>
                ) : null}
              </View>
              {wasCancelled ? null : isJoined ? (
                <View className="items-center">
                  <ProgressRing
                    progress={progressRatio}
                    size={72}
                    strokeWidth={7}
                    label={`${daysCompleted}`}
                    caption={isPoints ? 'tasks' : 'logs'}
                    labelClassName="text-[16px] font-extrabold text-white"
                    color="#72D9CB"
                  />
                  <AppText
                    className="mt-1 text-[12px] font-semibold"
                    style={{ color: '#fff' }}
                    numberOfLines={1}>
                    {goalLabel}
                  </AppText>
                </View>
              ) : (
                <View className="items-end">
                  <AppText
                    className="text-[11px] font-semibold uppercase"
                    style={{ color: 'rgba(255,255,255,0.62)', letterSpacing: 0.6 }}>
                    Goal
                  </AppText>
                  <AppText className="mt-1 text-[15px] font-bold" style={{ color: '#fff' }}>
                    {goalLabel}
                  </AppText>
                </View>
              )}
            </View>
          </View>
        </LinearGradient>

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

        {challenge.is_official ? (
          <Card className="mt-4 gap-2">
            <AppText className="text-[16px] font-extrabold leading-5 text-charcoal">
              {officialBob('cardPromise')}
            </AppText>
            <AppText className="text-[14px] leading-5 text-charcoal">{officialBob('legalBoard')}</AppText>
            <AppText className="mt-1 text-[13px] leading-5 text-muted">{officialBob('legalDays')}</AppText>
            <AppText className="text-[13px] leading-5 text-muted">{officialBob('legalAllFinish')}</AppText>
            <AppText className="text-[13px] leading-5 text-muted">{officialBob('legalZero')}</AppText>
            <AppText className="text-[12px] leading-5 text-muted">{officialBob('legalAge')}</AppText>
            <OfficialMoneyBoard
              challenge={challenge}
              finished={finishers}
              onInvite={() => setInviteOpen(true)}
            />
          </Card>
        ) : null}

        {taskCopy ? (
          <Card className="mt-4">
            <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              Task
            </AppText>
            <AppText className="mt-1 text-[13px] font-semibold text-muted">
              What you’re signing up for
            </AppText>
            <AppText className="mt-2 leading-6 text-ink">{taskCopy}</AppText>
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
        ) : isPoints ? (
          <Card className="mt-4">
            <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              Task
            </AppText>
            <AppText className="mt-1 text-[13px] font-semibold text-muted">
              What you’re signing up for
            </AppText>
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
          </Card>
        ) : null}

        <View className="mt-4">
          <ChallengeLeaderboard
            challenge={challenge}
            roster={boardRoster}
            completedUserIds={completions.data ?? new Set()}
          />
        </View>

        <Card className="mt-4 gap-3">
          <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Mechanics
          </AppText>
          {hideBuyIn ? null : (
            <View>
              <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                Buy-in
              </AppText>
              <AppText className="mt-1 text-xl font-bold text-charcoal">
                {isFreeEntry
                  ? isSponsoredBucks(challenge)
                    ? 'Free · pays Bucks'
                    : 'Free'
                  : money(buyInAmount)}
              </AppText>
            </View>
          )}
          <View>
            <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              {isPoints ? 'Task points' : isUnlimited ? 'Stay eligible' : 'To finish'}
            </AppText>
            <AppText className="mt-1 text-xl font-bold text-charcoal">
              {isPoints ? `${totalTaskPoints(challenge.tasks)} pts` : ruleCopy.cadenceLabel}
            </AppText>
            {isPoints || isUnlimited || !ruleCopy.totalHint ? null : (
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
                      <AppText className="text-[13px] leading-5 text-muted">
                        {proof.method === 'honor' ? 'Honor. Confirm to log.' : methodLabel(proof.method)}
                      </AppText>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          )}
        </Card>

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

        {wasCancelled ? null : (
        <Card className="mt-4">
          <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Prize
          </AppText>
          <AppText className="mt-2 text-[17px] font-semibold leading-6 text-charcoal">
            {prizeLine}
          </AppText>
        </Card>
        )}

        {isHost && inviteOnly && challenge.status !== 'settled' && !wasCancelled ? (
          <ChallengeInvitesCard
            challengeId={challenge.id}
            onInvitePerson={() => setInviteOpen(true)}
          />
        ) : null}

        <View className="mt-5">
          {challenge.status === 'settled' || challenge.status === 'cancelled' ? null : isHost &&
            showJudgingUi ? (
            <Card className="mb-3 gap-3">
              <AppText className="font-semibold text-charcoal">Judging</AppText>
              <AppText className="text-sm leading-5 text-muted">
                {gateOpen
                  ? `The 1 hour hold is done. Distribute ${bucks ? 'Bucks' : 'Coins'} to completers. This can only happen once.`
                  : `Results locked · payout after 1h hold${
                      payoutAt
                        ? ` · ${payoutCountdownLabel(payoutAt, new Date(nowMs))} left`
                        : ''
                    }.`}
              </AppText>
              {actionError && !confirmOpen && !judgeOpen && !settleOpen ? (
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
          currentUserId={user?.id}
          emptyTitle="Quiet in this challenge"
          emptyBody={
            isJoined
              ? participation?.eliminated_at
                ? 'You’re out, but you can still watch the check-ins.'
                : 'You’re in. Be the first to post a check-in here.'
              : 'Join the challenge to post in this feed.'
          }
          composerPlaceholder="How’s the work going?"
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
        style={{
          paddingHorizontal: 16,
          paddingTop: 10,
          paddingBottom: tabBarLift(insets.bottom),
          backgroundColor: THEME.background,
          borderTopWidth: 1,
          borderTopColor: THEME.border,
        }}>
        {isJoined ? (
          participation?.eliminated_at ? (
            <AppText className="text-sm leading-5 text-muted">
              {challenge.is_official ? officialBob('missed') : copy('challenge.eliminated')}
            </AppText>
          ) : waitingToStart ? (
            <Button title={logTitle} size="lg" disabled />
          ) : logsClosed ? (
            <Button title={copy('challenge.logClosed')} size="lg" disabled />
          ) : todaySubmission.isLoading ? (
            <Button title="Checking today’s log" size="lg" loading disabled />
          ) : loggedToday ? (
            <View className="gap-2">
              {healthProofLinesView ? (
                <View>
                  <AppText className="text-[13px] font-semibold text-charcoal">
                    {healthProofLinesView.primary}
                  </AppText>
                  {healthProofLinesView.secondary ? (
                    <AppText className="mt-0.5 text-[12px] text-muted">
                      {healthProofLinesView.secondary}
                    </AppText>
                  ) : null}
                </View>
              ) : null}
              <Button title="You’re good today" size="lg" variant="outline" disabled />
            </View>
          ) : (
            <View className="gap-2">
              <Button
                title={logTitle}
                size="lg"
                onPress={() => router.push(`/challenges/${id}/submit`)}
              />
              {watch.visible ? (
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
                  style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                  <AppText className="text-[15px] font-semibold" style={{ color: THEME.accent }}>
                    {copy('health.startWatch')}
                  </AppText>
                </Pressable>
              ) : null}
              {watchToast ? (
                <AppText className="text-center text-sm text-muted">{watchToast}</AppText>
              ) : null}
            </View>
          )
        ) : (
          <View className="gap-2">
            {joinBlocked ? (
              <AppText className="text-sm leading-5 text-coral-dark" numberOfLines={2}>
                {joinBlocked}
              </AppText>
            ) : (
              <AppText className="text-sm leading-5 text-muted" numberOfLines={1}>
                {isFreeEntry
                  ? bucks
                    ? 'Joining is free. The prize is still paid in real-money Bucks.'
                    : 'Joining is free. It does not take Coins from your wallet.'
                  : `Joining takes ${money(buyInAmount)} right now and adds it to the prize pool.`}
              </AppText>
            )}
            {actionError ? (
              <AppText className="text-sm leading-5 text-coral-dark">{actionError}</AppText>
            ) : null}
            {needsBodyMetrics ? (
              <Button
                title="Add body metrics"
                size="lg"
                onPress={() => router.push(BODY_METRICS_HREF)}
              />
            ) : canJoin ? (
              <Button
                title={isFreeEntry ? 'Join free' : `Join for ${money(buyInAmount)}`}
                size="lg"
                loading={join.isPending}
                onPress={onJoinPress}
              />
            ) : joinBlocked ? (
              <Button title="Unavailable" size="lg" disabled />
            ) : null}
          </View>
        )}
      </View>
      ) : null}

      <JoinConfirmModal
        visible={confirmOpen}
        challenge={challenge}
        loading={join.isPending}
        error={actionError}
        onClose={() => setConfirmOpen(false)}
        onConfirm={onConfirmJoin}
      />
      {isHost || isOfficialJoinable(challenge) ? (
        <InviteToChallengeModal
          visible={inviteOpen}
          challengeId={challenge.id}
          challengeTitle={challenge.title}
          friendsFirst={isOfficialJoinable(challenge)}
          onShareLink={() => {
            void shareOfficialChallenge(challenge.id).then((result) => {
              if (result === 'copied') {
                Alert.alert('Link copied', 'A small promise. Then you move.');
              }
            });
          }}
          onClose={() => setInviteOpen(false)}
        />
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

function HeroChip({
  label,
  dark,
  mint,
}: {
  label: string;
  dark?: boolean;
  mint?: boolean;
}) {
  return (
    <View
      className="self-start rounded-full px-2 py-1"
      style={{
        backgroundColor: dark
          ? THEME.primary
          : mint
            ? 'rgba(114, 217, 203, 0.28)'
            : 'rgba(255, 255, 255, 0.16)',
      }}>
      <AppText
        className="text-[10px] font-extrabold uppercase"
        style={{ color: '#fff', letterSpacing: 0.4, lineHeight: 12 }}>
        {label}
      </AppText>
    </View>
  );
}

function heroGoalLabel({
  daysCompleted,
  target,
  isPoints,
  isUnlimited,
  period,
  periodCount,
  taskCount,
}: {
  daysCompleted: number;
  target: number;
  isPoints: boolean;
  isUnlimited: boolean;
  period: string | null;
  periodCount: number;
  taskCount: number;
}) {
  if (isUnlimited) {
    return `${daysCompleted} logs`;
  }
  if (isPoints) {
    return `${daysCompleted} of ${taskCount} tasks`;
  }
  if (period === 'daily' && periodCount > 1) {
    return `${periodCount} / day`;
  }
  return `${daysCompleted} of ${Math.max(target, 1)} days`;
}
