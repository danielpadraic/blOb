import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchPublicProfilesByIds } from '@/lib/social';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { Image } from 'expo-image';

import { BucksTag } from '@/components/currency/BucksTag';
import { FeedList } from '@/components/feed/FeedList';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { JoinConfirmModal } from '@/components/challenge/JoinConfirmModal';
import { ChallengeInvitesCard } from '@/components/challenge/ChallengeInvitesCard';
import { ChallengeLeaderboard } from '@/components/challenge/ChallengeLeaderboard';
import { InviteToChallengeModal } from '@/components/challenge/InviteToChallengeModal';
import { SettleConfirmModal } from '@/components/challenge/SettleConfirmModal';
import { SettlementSummary } from '@/components/challenge/SettlementSummary';
import { MascotState } from '@/components/mascot/MascotState';
import { StackBackButton, useDismissTo } from '@/components/navigation/StackBackButton';
import { BODY_METRICS_HREF, LOBBY_HREF } from '@/lib/routes';
import { supabase } from '@/lib/supabase';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Divider } from '@/components/ui/Divider';
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
import { useLoggedWorkoutCount, usePeriodCompletions, useTodaySubmission } from '@/hooks/useWorkoutSubmission';
import { CHALLENGE_STATUS_LABEL, FUNDING_MODELS, proofMeta } from '@/lib/constants';
import { challengeRuleCopy } from '@/lib/challengeRuleCopy';
import {
  challengeTargetCount,
  competitorSpotsLabel,
  countLiveCompetitors,
  fundingModelSummary,
  isChallengeFull,
  isPointsChallenge,
  isUnlimitedChallenge,
  lastManStandingRequirement,
  normalizeFundingModel,
  participantLimitSummary,
  prizeStructureSummary,
  requiredProofTypes,
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
  loggingOpensHelper,
  payoutCountdownLabel,
  startsInLabel,
} from '@/lib/settlement';
import { isInviteOnlyChallenge } from '@/lib/challengeLane';
import { formatWallet, isBucksChallenge, isSponsoredBucks, walletBalance } from '@/lib/currency';
import { hasCompletedBodyMetrics } from '@/lib/bodyMetrics';
import { THEME } from '@/lib/theme';
import { copy } from '@/lib/copy';
import { getErrorMessage } from '@/utils/errors';
import {
  challengeTimingLabel,
  formatDateRange,
  prizeIfYouFinish,
} from '@/utils/format';

const BODY_METRICS_JOIN_COPY =
  'Missing: physical details. Official Challenges need them for matching — they stay private.';

export default function ChallengeDetailScreen() {
  const params = useLocalSearchParams<{ id: string; returnTo?: string }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const router = useRouter();
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
  const todaySubmission = useTodaySubmission(id);
  const loggedCount = useLoggedWorkoutCount(id);
  const completions = usePeriodCompletions(id);
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
  const daysCompleted = Math.max(
    Number(participation?.days_completed ?? 0),
    loggedCount.data ?? 0,
  );

  const estimate = useMemo(() => {
    if (!challenge) {
      return null;
    }
    return prizeIfYouFinish({
      prizePool: challenge.prize_pool,
      buyIn: challenge.buy_in_amount,
      participantCount: challenge.participant_count,
      alreadyJoined: isJoined,
    });
  }, [challenge, isJoined]);

  const joinBlocked = useMemo(() => {
    if (!challenge || isJoined) {
      return null;
    }
    if (challenge.status === 'settled' || challenge.status === 'judging' || challenge.status === 'cancelled_underfilled' || challenge.status === 'cancelled') {
      return 'This challenge is no longer accepting competitors.';
    }
    if (!isJoinWindowOpen(challenge)) {
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

  useEffect(() => {
    if (!needsBodyMetrics) {
      return;
    }
    void supabase.rpc('notify_my_profile_gate', { p_missing: 'physical details' });
  }, [needsBodyMetrics]);
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

  useEffect(() => {
    if (!judgingHold && !waitingToStart) {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [judgingHold, waitingToStart]);

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
      const now = Date.now();
      if (now - lastFocusFetchAt.current < 8000) {
        return;
      }
      lastFocusFetchAt.current = now;
      void refetchChallenge.current();
      void refetchRoster.current();
    }, [id]),
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
        <MascotState
          kind="loading"
          title="Loading challenge"
          body="Pulling rules, pool, and competitors."
        />
      </Screen>
    );
  }

  if (challengeQuery.error || !challenge) {
    return (
      <Screen>
        <MascotState
          kind="error"
          title={copy('challenge.notFound')}
          body={challengeQuery.error?.message ?? 'This blob wandered off.'}
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

  const proofSteps = requiredProofTypes(challenge);
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
  const fundingCopy = fundingModelSummary(challenge);
  const buyInAmount = Math.max(Number(challenge.buy_in_amount) || 0, 0);
  const isFreeEntry = buyInAmount <= 0;
  const bucks = isBucksChallenge(challenge);
  const money = (amount: number) => formatWallet(amount, challenge.currency);
  const poolIfYouJoin = isJoined
    ? Number(challenge.prize_pool)
    : Number(challenge.prize_pool) + buyInAmount;
  const structure = challenge.prize_structure;
  const estimateHeadline =
    structure === 'winner_take_all'
      ? 'Prize if you win'
      : structure === 'top_places'
        ? 'Prize pool'
        : 'Estimated prize if you finish';
  const estimateAmount =
    structure === 'winner_take_all' || structure === 'top_places'
      ? poolIfYouJoin
      : estimate?.share;
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

  return (
    <Screen padded={false} edges={['left', 'right', 'bottom']}>
      <Stack.Screen
        options={{
          title: 'Challenge',
          headerBackVisible: false,
          headerLeft: () => <StackBackButton />,
        }}
      />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 pb-12"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void onRefresh()}
            tintColor={THEME.accent}
          />
        }
        showsVerticalScrollIndicator={false}>
        <View className="gap-3 pt-2">
          <View className="flex-row flex-wrap gap-2">
            {isBucksChallenge(challenge) ? <BucksTag challenge={challenge} /> : null}
            {challenge.is_official ? (
              <Badge label={isSponsoredBucks(challenge) ? 'Sponsored' : 'Official'} tone="charcoal" />
            ) : null}
            {challenge.visibility === 'private' ? <Badge label="Private" tone="muted" /> : null}
            {isHost && !isJoined ? <Badge label="Hosting" tone="charcoal" /> : null}
            {isJoined ? <Badge label="Joined" tone="mint" /> : null}
            {inviteOnly && !isHost && !isJoined ? <Badge label="Invited" tone="coral" /> : null}
            <Badge label={isPoints ? 'Points' : 'Consistency'} tone="mint" />
            {isUnlimited ? <Badge label="Last man standing" tone="charcoal" /> : null}
            <Badge
              label={
                showJudgingUi
                  ? 'Judging'
                  : (CHALLENGE_STATUS_LABEL[challenge.status] ?? challenge.status)
              }
              tone={
                challenge.status === 'settled'
                  ? 'mint'
                  : showJudgingUi || challenge.status === 'judging'
                    ? 'charcoal'
                    : 'coral'
              }
            />
          </View>
          <AppText className="text-[28px] font-extrabold leading-8 text-charcoal">
            {challenge.title}
          </AppText>
          {challenge.cover_image_url ? (
            <Image
              source={{ uri: challenge.cover_image_url }}
              style={{
                marginTop: 12,
                height: 180,
                width: '100%',
                borderRadius: THEME.radius,
                backgroundColor: THEME.background,
              }}
              contentFit="cover"
              cachePolicy="memory-disk"
              accessibilityLabel={`${challenge.title} cover`}
            />
          ) : null}
          {hostQuery.data ? (
            <ProfileLink username={hostQuery.data.username} userId={hostQuery.data.id}>
              <AppText className="text-[13px] text-muted">
                Hosted by{' '}
                <AppText className="font-semibold text-charcoal">
                  {hostQuery.data.display_name ?? hostQuery.data.username}
                </AppText>
              </AppText>
            </ProfileLink>
          ) : null}
          {isHost && !inviteOnly && challenge.status !== 'settled' ? (
            <View className="mt-3 self-start">
              <Button
                title="Invite someone"
                variant="outline"
                size="sm"
                onPress={() => setInviteOpen(true)}
              />
            </View>
          ) : null}
          <AppText className="text-muted">
            {isUnlimited
              ? 'Ongoing • Last Man Standing'
              : `${challengeTimingLabel(challenge.starts_at, challenge.ends_at)} · ${formatDateRange(challenge.starts_at, challenge.ends_at)}`}
          </AppText>
        </View>

        {receipt ? (
          <View className="mt-6">
            <SettlementSummary
              settlement={receipt}
              userId={user?.id}
              joined={isJoined}
              daysCompleted={daysCompleted}
              targetCount={target}
              currency={challenge.currency}
            />
          </View>
        ) : null}

        {challenge.description ? (
          <Card className="mt-6">
            <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              What you’re signing up for
            </AppText>
            <AppText className="mt-2 leading-6 text-ink">{challenge.description}</AppText>
          </Card>
        ) : null}

        <View className="mt-4">
          <ChallengeLeaderboard
            challenge={challenge}
            roster={boardRoster}
            completedUserIds={completions.data ?? new Set()}
          />
        </View>

        {challenge.rules_video_url ? (
          <Card className="mt-4">
            <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              Rules video
            </AppText>
            <Pressable
              onPress={() => void Linking.openURL(challenge.rules_video_url!)}
              accessibilityRole="link"
              accessibilityLabel="Open rules video">
              <AppText className="mt-2 font-semibold text-charcoal underline">
                Watch the rules
              </AppText>
            </Pressable>
          </Card>
        ) : null}

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
          <View className={isPoints || ruleCopy.primary || ruleCopy.extras.length > 0 ? 'mt-4 gap-2' : 'mt-2 gap-2'}>
            <RuleLine
              text={
                isFreeEntry
                  ? bucks
                    ? 'Entry is free. This official challenge still pays the prize in real-money Bucks.'
                    : 'Entry is free. The prize pool is already funded — joining does not take Coins from your wallet.'
                  : `Pay ${money(buyInAmount)} to enter. It is not held — it goes into the prize pool immediately.`
              }
            />
            <RuleLine text={fundingCopy} />
            {isPoints ? (
              <RuleLine
                text={`Complete the task list to earn ${totalTaskPoints(challenge.tasks)} pts across ${challenge.tasks.length} task${challenge.tasks.length === 1 ? '' : 's'}.`}
              />
            ) : isUnlimited ? (
              <RuleLine text={lastManStandingRequirement(challenge)} />
            ) : null}
            <RuleLine text={prizeCopy} />
          </View>
        </Card>

        <View className="mt-4 flex-row gap-3">
          <Card className="flex-1">
            <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              {isFreeEntry ? 'Entry' : 'Buy-in'}
            </AppText>
            <AppText className="mt-1 text-xl font-bold text-charcoal">
              {isFreeEntry
                ? isSponsoredBucks(challenge)
                  ? 'Free · pays Bucks'
                  : 'Free'
                : money(buyInAmount)}
            </AppText>
          </Card>
          <Card className="flex-1">
            <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              {isPoints ? 'Task points' : isUnlimited ? 'Stay eligible' : 'To finish'}
            </AppText>
            <AppText className="mt-1 text-xl font-bold text-charcoal">
              {isPoints ? `${totalTaskPoints(challenge.tasks)} pts` : ruleCopy.cadenceLabel}
            </AppText>
            {isPoints || isUnlimited || !ruleCopy.totalHint ? null : (
              <AppText className="mt-1 text-xs leading-4 text-muted">{ruleCopy.totalHint}</AppText>
            )}
          </Card>
        </View>

        {isPoints ? (
          <Card className="mt-3">
            <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              Task list
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
        ) : (
          <Card className="mt-3">
            <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              {proofHeadline}
            </AppText>
            <View className="mt-3 gap-2.5">
              {proofSteps.map((type, index) => {
                const meta = proofMeta(type);
                return (
                  <View key={type} className="flex-row gap-3">
                    <View
                      className="h-6 w-6 items-center justify-center rounded-full"
                      style={{ backgroundColor: THEME.accentSoft }}>
                      <AppText className="text-[12px] font-bold" style={{ color: THEME.accent }}>
                        {index + 1}
                      </AppText>
                    </View>
                    <View className="flex-1">
                      <AppText className="font-semibold text-charcoal">{meta.label}</AppText>
                      <AppText className="text-[13px] leading-5 text-muted">{meta.helper}</AppText>
                    </View>
                  </View>
                );
              })}
            </View>
          </Card>
        )}

        <Card className="mt-3">
          <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            How the prize is funded
          </AppText>
          <AppText className="mt-2 text-[17px] font-semibold leading-6 text-charcoal">
            {FUNDING_MODELS.find(
              (item) => item.value === normalizeFundingModel(challenge.funding_model),
            )?.label ?? 'Competitor funded'}
          </AppText>
          <AppText className="mt-2 text-sm leading-5 text-muted">{fundingCopy}</AppText>
          <AppText className="mt-2 text-sm leading-5 text-muted">
            {isFreeEntry ? 'Buy-in: Free' : `Buy-in: ${money(buyInAmount)}`}
            {' · '}
            {participantLimitSummary(challenge)}
          </AppText>
        </Card>

        <Card className="mt-3">
          <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Prize structure
          </AppText>
          <AppText className="mt-2 text-[17px] font-semibold leading-6 text-charcoal">
            {prizeCopy}
          </AppText>
          <AppText className="mt-2 text-sm leading-5 text-muted">
            {challenge.status === 'settled'
              ? 'Paid out this way when the challenge settled.'
              : isUnlimited
                ? 'The last remaining eligible person takes the entire prize pool.'
                : 'Paid out this way when the challenge settles.'}
          </AppText>
        </Card>

        {isUnlimited && challenge.status !== 'settled' ? (
          <Card className="mt-3">
            <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              Last man standing
            </AppText>
            <AppText className="mt-2 text-[17px] font-semibold leading-6 text-charcoal">
              {lastManStandingRequirement(challenge)}
            </AppText>
            <View className="mt-4 flex-row gap-3">
              <View className="flex-1">
                <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                  Still active
                </AppText>
                <AppText className="mt-1 text-xl font-bold text-charcoal">
                  {challenge.eligible_count ?? challenge.participant_count}
                </AppText>
              </View>
              <View className="flex-1">
                <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                  Eliminated
                </AppText>
                <AppText className="mt-1 text-xl font-bold text-charcoal">
                  {challenge.eliminated_count ?? 0}
                </AppText>
              </View>
            </View>
            <AppText className="mt-3 text-sm leading-5 text-muted">
              Unlimited duration — last person still meeting the goal wins everything.
            </AppText>
          </Card>
        ) : null}

        {challenge.status === 'settled' ? null : (
          <>
        <Card className="mt-4" style={{ backgroundColor: THEME.accentSoft, borderColor: THEME.accentSoft }}>
          <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            {estimateHeadline}
          </AppText>
          <AppText className="mt-1 text-4xl font-bold" style={{ color: THEME.accent }}>
            {estimateAmount != null ? money(estimateAmount) : '—'}
          </AppText>
          <AppText className="mt-2 text-sm leading-5 text-muted">
            {structure === 'winner_take_all'
              ? isUnlimited
                ? `The whole pool is ${money(poolIfYouJoin)}. The last person still meeting the requirement takes all of it.`
                : `The whole pool is ${money(poolIfYouJoin)}. One winner takes all of it.`
              : structure === 'top_places'
                ? `${prizeCopy} Current pool ${money(poolIfYouJoin)}.`
                : isJoined
                  ? `Current pool ${money(challenge.prize_pool)} ÷ ${challenge.participant_count || 1} current competitor${challenge.participant_count === 1 ? '' : 's'}, if they all finish.`
                  : `If you join now: ${money(poolIfYouJoin)} ÷ ${challenge.participant_count + 1} competitors, if everyone finishes.`}
          </AppText>
        </Card>

        <AppText className="mt-3 text-xs leading-5 text-muted">
          {structure === 'equal_split' || !structure
            ? isPoints
              ? 'This is an estimate of an equal split of the buy-in pool. Ranking by task points comes later.'
              : `This is an estimate, not a guarantee. The real payout is the prize pool divided by the number of people who finish (${ruleCopy.cadenceLong}). Miss the target and you get 0.00 Coins.`
            : 'This is the current pool, not a guarantee of what you personally take home. Payout follows the prize structure above.'}
        </AppText>
          </>
        )}

        {isHost && inviteOnly && challenge.status !== 'settled' ? (
          <ChallengeInvitesCard
            challengeId={challenge.id}
            onInvitePerson={() => setInviteOpen(true)}
          />
        ) : null}

        <Card className="mt-4 flex-row justify-between gap-2">
          <MetaStat
            label="Status"
            value={
              showJudgingUi
                ? 'Judging'
                : (CHALLENGE_STATUS_LABEL[challenge.status] ?? challenge.status)
            }
          />
          <MetaStat
            label="Time"
            value={challengeTimingLabel(challenge.starts_at, challenge.ends_at, isUnlimited)}
          />
          <MetaStat
            label="Spots"
            value={competitorSpotsLabel(competitorCount, challenge.max_participants)}
          />
        </Card>

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

          {isJoined ? (
            participation?.eliminated_at ? (
              <Card className="gap-3">
                <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                  Last man standing
                </AppText>
                <AppText className="text-xl font-bold text-charcoal">{copy('challenge.eliminated')}</AppText>
                <AppText className="text-sm leading-5 text-muted">
                  You missed the requirement and are out. You can still watch the feed, but you
                  cannot log or win the prize pool.
                </AppText>
              </Card>
            ) : (
            <Card className="gap-4">
              <View className="flex-row items-center gap-4">
                <ProgressRing
                  progress={
                    isUnlimited
                      ? 1
                      : daysCompleted /
                        Math.max(isPoints ? Math.max(challenge.tasks.length, 1) : target, 1)
                  }
                  label={`${daysCompleted}`}
                  caption={
                    isUnlimited
                      ? 'logs'
                      : isPoints
                        ? `of ${Math.max(challenge.tasks.length, 1)}`
                        : 'logs'
                  }
                  color={THEME.accent}
                />
                <View className="flex-1">
                  <AppText className="font-semibold text-charcoal">
                    {waitingToStart
                      ? (startsInLabel(challenge, new Date(nowMs)) ?? 'Not started yet')
                      : isUnlimited
                        ? 'You’re still in'
                        : 'Your progress'}
                  </AppText>
                  <AppText className="mt-1 text-sm leading-5 text-muted">
                    {waitingToStart
                      ? loggingOpensHelper(challenge, new Date(nowMs))
                      : isUnlimited
                      ? `${lastManStandingRequirement(challenge)}${
                          loggedToday ? ' Today’s log is in.' : ''
                        }`
                      : isPoints
                      ? `${daysCompleted} of ${Math.max(challenge.tasks.length, 1)} tasks${
                          loggedToday ? ' · today is in.' : '.'
                        }`
                      : `${daysCompleted} log${daysCompleted === 1 ? '' : 's'} in${
                          loggedToday ? ' · today is in.' : '.'
                        } Keep ${ruleCopy.cadenceLabel} to finish.`}
                  </AppText>
                </View>
              </View>
              {waitingToStart ? (
                <Button title={logTitle} size="lg" disabled />
              ) : logsClosed ? (
                <View
                  className="rounded-blob px-4 py-3"
                  style={{ backgroundColor: THEME.border }}>
                  <AppText className="font-semibold text-charcoal">{copy('challenge.logClosed')}</AppText>
                  <AppText className="mt-1 text-sm leading-5 text-muted">
                    {challenge.status === 'settled'
                      ? 'This challenge is settled. Your result is in the receipt above.'
                      : challenge.status === 'judging'
                        ? 'Results locked · payout after 1h hold'
                        : 'The window is over. New logs are not accepted.'}
                  </AppText>
                </View>
              ) : todaySubmission.isLoading ? (
                <Button title="Checking today’s log" size="lg" loading disabled />
              ) : loggedToday ? (
                <View
                  className="rounded-blob px-4 py-3"
                  style={{ backgroundColor: THEME.accentSoft }}>
                  <AppText className="font-semibold" style={{ color: THEME.accent }}>
                    Today’s workout is logged
                  </AppText>
                  <AppText className="mt-1 text-sm leading-5 text-muted">
                    Come back tomorrow for the next proof set. One log per UTC day.
                  </AppText>
                </View>
              ) : (
                <Button
                  title={logTitle}
                  size="lg"
                  onPress={() => router.push(`/challenges/${id}/submit`)}
                />
              )}
            </Card>
            )
          ) : challenge.status === 'settled' || challenge.status === 'judging' ? null : (
            <Card className="gap-3">
              {profile ? (
                <AppText className="text-sm text-muted">
                  {bucks
                    ? `Bucks: ${formatWallet(walletBalance(profile, 'bucks'), 'bucks')}.`
                    : `Coins: ${formatWallet(walletBalance(profile, 'coins'), 'coins')}.`}
                </AppText>
              ) : null}
              {joinBlocked ? (
                <AppText className="text-sm leading-5 text-coral-dark">{joinBlocked}</AppText>
              ) : (
                <AppText className="text-sm leading-5 text-muted">
                  {isFreeEntry
                    ? bucks
                      ? 'Joining is free. The prize is still paid in real-money Bucks.'
                      : 'Joining is free. It does not take Coins from your wallet.'
                    : `Joining takes ${money(buyInAmount)} right now and adds it to the prize pool.`}
                </AppText>
              )}
              {isUnlimited ? (
                <AppText className="text-sm leading-5 text-muted">
                  {lastManStandingRequirement(challenge)}
                </AppText>
              ) : null}
              <AppText className="text-sm leading-5 text-muted">
                {participantLimitSummary(challenge)}
              </AppText>
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
              ) : null}
            </Card>
          )}
        </View>

        <Divider className="my-8" />

        <AppText className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
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
          onComment={(post, content, parentId) =>
            createComment.mutateAsync({ postId: post.id, content, parentId })
          }
        />
      </ScrollView>

      <JoinConfirmModal
        visible={confirmOpen}
        challenge={challenge}
        loading={join.isPending}
        error={actionError}
        onClose={() => setConfirmOpen(false)}
        onConfirm={onConfirmJoin}
      />
      {isHost ? (
        <InviteToChallengeModal
          visible={inviteOpen}
          challengeId={challenge.id}
          challengeTitle={challenge.title}
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

function MetaStat({ label, value }: { label: string; value: string }) {
  return (
    <View className="min-w-0 flex-1">
      <AppText
        className="font-semibold uppercase text-muted"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
        style={{ fontSize: 10, letterSpacing: 0.4 }}>
        {label}
      </AppText>
      <AppText
        className="mt-1 font-semibold text-charcoal"
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}>
        {value}
      </AppText>
    </View>
  );
}
