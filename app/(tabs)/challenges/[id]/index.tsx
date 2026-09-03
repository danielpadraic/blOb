import {
  Stack,
  useFocusEffect,
  useLocalSearchParams,
  usePathname,
  useRouter,
  type ErrorBoundaryProps,
} from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { fetchPublicProfilesByIds } from '@/lib/social';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiveThread } from '@/components/challenge/LiveThread';
import { ChallengeDetailsCard } from '@/components/challenge/ChallengeDetailsCard';
import { MissBudgetLines } from '@/components/challenge/MissBudgetLines';
import { CalloutHonorCard } from '@/components/challenge/CalloutHonorCard';
import { CalloutRematchButton } from '@/components/challenge/CalloutRematchButton';
import { CalloutLiveWatchChip, CalloutWatchers } from '@/components/challenge/CalloutWatchers';
import { HostRoundPromptChip } from '@/components/challenge/HostRoundPromptChip';
import { PeriodCheckinDue } from '@/components/challenge/PeriodCheckinDue';
import { ChallengeHeroCard } from '@/components/challenge/ChallengeHeroCard';
import { ChallengeInvitesCard } from '@/components/challenge/ChallengeInvitesCard';
import { ChallengeLeaderboard } from '@/components/challenge/ChallengeLeaderboard';
import { ChallengePrizeLine } from '@/components/challenge/ChallengePrizeLine';
import { ChallengeResultCard } from '@/components/challenge/ChallengeResultCard';
import { PaidReceiptOverlay } from '@/components/challenge/PaidReceiptOverlay';
import { HostPrizeTopUp } from '@/components/challenge/HostPrizeTopUp';
import { FieldNoteLabel, ChallengeNotesProvider } from '@/components/challenge/FieldNote';
import { OfficialMoneyBoard } from '@/components/challenge/OfficialMoneyBoard';
import { ChallengeDetailHeaderRight } from '@/components/challenge/ChallengeDetailOverflow';
import { useInviteHost } from '@/components/challenge/InviteHost';
import { useJoinConfirm } from '@/components/challenge/JoinConfirmHost';
import { useOfficialDob } from '@/components/interests/OfficialDobHost';
import { JoinCtaButton, JOIN_CTA_HEIGHT } from '@/components/challenge/JoinCtaButton';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { HealthProofCaption } from '@/components/challenge/HealthProofCaption';
import { LocationVenueLine } from '@/components/challenge/LocationProofRow';
import { SettleConfirmModal } from '@/components/challenge/SettleConfirmModal';
import { ChallengeLifecycleStatus } from '@/components/challenge/ChallengeLifecycleStatus';
import { StakeAmount } from '@/components/currency/CurrencyMark';
import { MascotState } from '@/components/mascot/MascotState';
import { StackBackButton, useDismissTo } from '@/components/navigation/StackBackButton';
import { useHostRoundPrompt } from '@/hooks/useHostRoundPrompt';
import { BODY_METRICS_HREF, captureHref, challengeDetailHref, checkinSubmitHref, LOBBY_HREF } from '@/lib/routes';
import { pushChallengeHref } from '@/lib/challengeNav';
import {
  CALLOUT_CHEER_PLACEHOLDER,
  CALLOUT_WATCHING_LINE,
  isCalloutChallengeObserver,
  isCalloutFighter,
} from '@/lib/callouts';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Screen } from '@/components/ui/Screen';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import {
  useCalloutCardParties,
  useCalloutForChallenge,
  useCalloutObservers,
} from '@/hooks/useCallouts';
import {
  useChallenge,
  useChallengeFeedPreview,
  useChallengeParticipants,
  useChallengeSettlement,
  useMarkChallengeJudging,
  useSettleChallenge,
} from '@/hooks/useChallenge';
import {
  useCreatePost,
  useFeed,
} from '@/hooks/useFeed';
import { useToggleLiveReaction } from '@/hooks/useLiveReaction';
import { useMyProfile, useProfile } from '@/hooks/useProfile';
import { useWalletOptional } from '@/hooks/useWallet';
import { useStartOnWatch } from '@/hooks/useStartOnWatch';
import { useChallengeBoardRealtime } from '@/hooks/useChallengeBoardRealtime';
import { isChallengeRealtimeId } from '@/lib/challengeBoardRealtime';
import { usePeriodCheckin, useSubmittedCheckinCount } from '@/hooks/useChallengeCheckin';
import { useViewerPeriodMisses } from '@/hooks/usePeriodMisses';
import { currentRequiredPeriodWindow } from '@/lib/checkinPeriod';
import { challengeShowsMissBudget } from '@/lib/missDuty';
import { usePeriodCompletions } from '@/hooks/useWorkoutSubmission';
import { ChallengePageTabs, CHALLENGE_LIVE_ONLY_TABS, type ChallengePageTab } from '@/components/challenge/ChallengePageTabs';
import {
  requiresOfficialBodyMetrics,
  usesComparablePointsScoring,
  usesConsistencyExperience,
  usesCumulativeScoring,
  usesPointsBoard,
  usesTotalCountCheckins,
} from '@/lib/challengeExperience';
import { methodLabel, proofDisplayName, signupProofLines } from '@/lib/challengeProofs';
import { parseLocationPlace } from '@/lib/locationProof';
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
  comparablePointsFromChallenge,
  comparablePointsHeadline,
  comparablePointsLiveSentence,
} from '@/lib/comparablePoints';
import {
  canMarkJudging,
  canSettleChallenge,
  completerCount,
  distributableAt,
  hasChallengeEnded,
  hasChallengeStarted,
  isClosedForLogs,
  isDistributeGateOpen,
  isEvenSplitAutoSettle,
  isJoinWindowOpen,
  nobodyFinishedRuleCopy,
  payoutCountdownLabel,
  settlementErrorCopy,
  settlementVoidKind,
  shouldTickSettlements,
  settlementReviewReadyAt,
  startsInLabel,
  trySettleIfEnded,
  voidReceiptCopy,
  overviewMoneyPhase,
  WRAPPING_UP_PROOFS_COPY,
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
import { athleteDistanceUnit } from '@/lib/distance';
import { cumulativeTargetMeters, rawCumulativeTargetMeters } from '@/lib/cumulative';
import { challengeGoalLabel, challengeDurationDays, pointsGoalTarget } from '@/lib/challengeGoal';
import { bucksJoinCta, INSUFFICIENT_JOIN_COPY } from '@/lib/joinCta';
import { hasCompletedBodyMetrics } from '@/lib/bodyMetrics';
import { isSubmittedCheckin } from '@/lib/challengeCheckin';
import { buildBoard, yourStandingLine } from '@/lib/board';
import { tabBarLift, THEME } from '@/lib/theme';
import { reportAppError, extractPostgrestCode } from '@/lib/appErrors';
import { challengeLoadKind, firstRouteParam } from '@/lib/challengeLoad';
import { challengeHasDurationHint, resolveChallengeHero } from '@/lib/challengeOpen';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import { useStableChallengeRouteId, scrollNodeTo } from '@/lib/challengeRoute';
import { copy } from '@/lib/copy';
import { getErrorMessage } from '@/utils/errors';

const BODY_METRICS_JOIN_COPY =
  'Missing: physical details. Official Fitness Challenges need them for matching — they stay private.';

function ChallengeStackTitle({
  challenge,
}: {
  challenge: {
    title?: string | null;
    task?: string | null;
    tasks?: Array<{ title?: string | null } | string> | null;
    extra_tasks?: Array<{ title?: string | null } | string> | null;
    is_callout?: boolean | null;
    win_condition?: string | null;
  } | null;
}) {
  const label = challengeDisplayTitle(challenge);
  if (!label) {
    return null;
  }
  return (
    <View style={{ flex: 1, minWidth: 0, maxWidth: '100%', justifyContent: 'center' }}>
      <AppText
        numberOfLines={1}
        ellipsizeMode="tail"
        className="text-[17px] font-extrabold text-charcoal"
        style={{ minWidth: 0, maxWidth: '100%', flexShrink: 1 }}>
        {label}
      </AppText>
    </View>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => {
    reportAppError({
      route: 'challenge/detail-boundary',
      error,
      payload: { errorCode: extractPostgrestCode(error) },
    });
  }, [error]);
  return (
    <Screen>
      <MascotState
        kind="error"
        title="Something went wrong"
        body="Try again in a moment."
        actionLabel="Retry"
        onAction={() => void retry()}
      />
    </Screen>
  );
}

export default function ChallengeDetailScreen() {
  const params = useLocalSearchParams<{
    id: string;
    returnTo?: string;
    logged?: string;
    funded?: string;
    postId?: string;
    tab?: string;
    receipt?: string;
  }>();
  const routeParam = firstRouteParam(params.id);
  const { id, waiting: waitingForId } = useStableChallengeRouteId(routeParam);
  const returnTo = Array.isArray(params.returnTo) ? params.returnTo[0] : params.returnTo;
  const highlightPostId = Array.isArray(params.postId) ? params.postId[0] : params.postId;
  const tabParam = Array.isArray(params.tab) ? params.tab[0] : params.tab;
  const receiptParam = Array.isArray(params.receipt) ? params.receipt[0] : params.receipt;
  const loggedParam = Array.isArray(params.logged) ? params.logged[0] : params.logged;
  const fundedParam = Array.isArray(params.funded) ? params.funded[0] : params.funded;
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  useDismissTo(returnTo === 'feed' ? '/feed' : LOBBY_HREF);
  const { user } = useAuth();
  const { profile, refetch: refetchProfile } = useMyProfile();
  const wallet = useWalletOptional();
  const challengeQuery = useChallenge(id || undefined);
  const previewQuery = useChallengeFeedPreview(id || undefined);
  const loadKind = challengeLoadKind(challengeQuery.error);
  const showQueryError =
    Boolean(id) &&
    challengeQuery.isError &&
    !challengeQuery.isFetching &&
    !challengeQuery.isLoading;
  const challenge = resolveChallengeHero({
    id,
    queryData:
      !showQueryError && challengeQuery.data?.id === id ? challengeQuery.data : undefined,
    preview: previewQuery.data,
  });
  const hostQuery = useProfile(challenge?.created_by ?? undefined);
  const roster = useChallengeParticipants(id);
  const calloutQuery = useCalloutForChallenge(id, Boolean(challenge?.is_callout));
  const observersQuery = useCalloutObservers(calloutQuery.data?.id);
  const watchingIds = useMemo(
    () => (observersQuery.data ?? []).map((row) => row.user_id),
    [observersQuery.data],
  );
  const isCalloutFighterViewer = Boolean(
    calloutQuery.data && isCalloutFighter(calloutQuery.data, user?.id),
  );
  const isCalloutObserver = isCalloutChallengeObserver(calloutQuery.data, watchingIds, user?.id);
  const watchingCount = watchingIds.length;
  const calloutParties = useCalloutCardParties(challenge?.is_callout && id ? [id] : []);
  const calloutParty = id ? calloutParties.data?.get(id) ?? null : null;
  const boardProfiles = useQuery({
    queryKey: ['challenge-board-profiles', id, (roster.data ?? []).map((row) => row.user_id).join(',')],
    enabled: Boolean(id && roster.data && roster.data.length > 0),
    queryFn: () => fetchPublicProfilesByIds((roster.data ?? []).map((row) => row.user_id)),
  });
  const boardRoster = useMemo(() => {
    const map = new Map(
      (boardProfiles.data ?? [])
        .filter((profile) => Boolean(profile?.id))
        .map((profile) => [profile.id, profile]),
    );
    return (roster.data ?? []).map((row) => ({
      ...row,
      profile: map.get(row.user_id) ?? row.profile,
    }));
  }, [boardProfiles.data, roster.data]);
  const periodCheckin = usePeriodCheckin(id, challengeQuery.data);
  const periodMisses = useViewerPeriodMisses(
    id,
    Boolean(challengeQuery.data && challengeShowsMissBudget(challengeQuery.data)),
  );
  useChallengeBoardRealtime(isChallengeRealtimeId(id) ? id : undefined);
  const submittedCheckins = useSubmittedCheckinCount(id, challengeQuery.data);
  const completions = usePeriodCompletions(id, challengeQuery.data);
  const joinSheet = useJoinConfirm();
  const officialDob = useOfficialDob();
  const inviteHost = useInviteHost();
  const markJudging = useMarkChallengeJudging();
  const settle = useSettleChallenge();
  const settlementQuery = useChallengeSettlement(id);
  const feed = useFeed(id);
  const createPost = useCreatePost(id);
  const toggleLiveReaction = useToggleLiveReaction();

  const [judgeOpen, setJudgeOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [watchToast, setWatchToast] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pageTab, setPageTab] = useState<ChallengePageTab>(
    highlightPostId ? 'feed' : tabParam === 'board' || tabParam === 'feed' || tabParam === 'overview'
      ? tabParam
      : receiptParam === '1'
        ? 'overview'
        : 'overview',
  );
  const [receiptOpen, setReceiptOpen] = useState(receiptParam === '1');

  useEffect(() => {
    if (isCalloutObserver) {
      setPageTab('feed');
      return;
    }
    const next: ChallengePageTab = highlightPostId
      ? 'feed'
      : tabParam === 'board' || tabParam === 'feed' || tabParam === 'overview'
        ? tabParam
        : 'overview';
    setPageTab(next);
  }, [highlightPostId, id, isCalloutObserver, tabParam]);

  const hostProfile = hostQuery.data;
  const heroHost =
    hostProfile && typeof hostProfile === 'object' && hostProfile.id
      ? {
          id: String(hostProfile.id),
          username: String(hostProfile.username ?? ''),
          display_name: hostProfile.display_name,
        }
      : null;
  const loggedLoadRef = useRef<string | null>(null);
  useEffect(() => {
    if (waitingForId || challengeQuery.isLoading || challengeQuery.isFetching) {
      return;
    }
    if (!showQueryError && id) {
      return;
    }
    const key = `${id || routeParam}:${challengeQuery.status}:${loadKind ?? 'empty'}`;
    if (loggedLoadRef.current === key) {
      return;
    }
    loggedLoadRef.current = key;
    reportAppError({
      route: 'challenge/detail',
      error: challengeQuery.error,
      code: loadKind ?? extractPostgrestCode(challengeQuery.error),
      payload: {
        challengeId: id || null,
        routeParam: routeParam || null,
        queryStatus: challengeQuery.status,
        errorCode: loadKind ?? extractPostgrestCode(challengeQuery.error),
      },
    });
  }, [
    challengeQuery.error,
    challengeQuery.isFetching,
    challengeQuery.isLoading,
    challengeQuery.status,
    id,
    loadKind,
    routeParam,
    showQueryError,
    waitingForId,
  ]);
  const participation = useMemo(
    () => roster.data?.find((row) => row.user_id === user?.id) ?? null,
    [roster.data, user?.id],
  );
  const isJoined = Boolean(participation);
  const isHost = Boolean(challenge && user?.id && challenge.created_by === user.id);
  const mentionMemberIds = useMemo(() => {
    const ids = new Set<string>();
    if (challenge?.created_by) {
      ids.add(challenge.created_by);
    }
    for (const row of roster.data ?? []) {
      if (row.user_id) {
        ids.add(row.user_id);
      }
    }
    return [...ids];
  }, [challenge?.created_by, roster.data]);
  const hostRoundPrompt = useHostRoundPrompt(challenge);
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
      privacyMode: challenge.privacy_mode,
    });
  }
  const competitorCount = useMemo(() => {
    if (!roster.data) {
      return Math.max(Number(challenge?.participant_count) || 0, isJoined ? 1 : 0);
    }
    return countLiveCompetitors(roster.data);
  }, [challenge?.participant_count, isJoined, roster.data]);
  const standingLine = useMemo(() => {
    if (!challenge || !user?.id || !isJoined) {
      return null;
    }
    const view = buildBoard({
      status: challenge.status,
      participants: (roster.data ?? []).map((row) => ({
        user_id: row.user_id,
        days_completed: row.days_completed,
        points: row.points,
        status: row.status,
        eliminated_at: row.eliminated_at,
      })),
      viewerId: user.id,
      joined: true,
    });
    return yourStandingLine(
      view.people,
      user.id,
      usesPointsBoard(challenge) ? 'points' : 'days',
    );
  }, [challenge, isJoined, roster.data, user?.id]);
  const durationDays = challengeDurationDays(challenge);
  const loggedToday =
    periodCheckin.data?.phase === 'submitted' || isSubmittedCheckin(periodCheckin.data);
  const checkinPhase = loggedToday ? 'submitted' : (periodCheckin.data?.phase ?? 'none');
  const daysCompleted = heroRingDays({
    status: challengeQuery.data?.status,
    submitted: Math.max(submittedCheckins.data ?? 0, loggedToday && !usesTotalCountCheckins(challenge) ? 1 : 0),
  });

  const joinBlocked = useMemo(() => {
    if (!challenge || isJoined) {
      return null;
    }
    if (isCalloutObserver || challenge.is_callout) {
      return CALLOUT_WATCHING_LINE;
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
    if (requiresOfficialBodyMetrics(challenge) && !hasCompletedBodyMetrics(profile)) {
      return BODY_METRICS_JOIN_COPY;
    }
    const buyIn = Number(challenge.buy_in_amount) || 0;
    const held = walletBalance(profile, challenge.currency);
    if (buyIn > 0 && profile && held < buyIn && !isBucksChallenge(challenge)) {
      return `You need ${formatWalletAmount(buyIn, challenge.currency)} to join. You have ${formatWalletAmount(held, challenge.currency)}.`;
    }
    return null;
  }, [challenge, isCalloutObserver, isHost, isJoined, profile]);

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
  const canJoin = canJoinBase;
  const wasCancelled = challenge?.status === 'cancelled';

  useEffect(() => {
    if (fundedParam !== '1') {
      return;
    }
    void refetchProfile();
  }, [fundedParam, refetchProfile]);

  useEffect(() => {
    if (highlightPostId) {
      setPageTab('feed');
    }
  }, [highlightPostId]);

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
  const periodDueClock = Boolean(
    challenge && currentRequiredPeriodWindow(challenge, new Date(nowMs)),
  );

  useEffect(() => {
    if (!judgingHold && !waitingToStart && !officialLiveClock && !periodDueClock) {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [judgingHold, officialLiveClock, periodDueClock, waitingToStart]);

  const scrollRef = useRef<ScrollView>(null);
  const scrolledSettledId = useRef<string | null>(null);

  useEffect(() => {
    if (!id || challenge?.status !== 'settled') {
      if (id !== scrolledSettledId.current) {
        scrolledSettledId.current = null;
      }
      return;
    }
    if (scrolledSettledId.current === id) {
      return;
    }
    scrolledSettledId.current = id;
    scrollNodeTo(scrollRef.current, { y: 0, animated: false });
  }, [challenge?.status, id]);

  useEffect(() => {
    if (highlightPostId && pageTab === 'feed') {
      return;
    }
    scrollNodeTo(scrollRef.current, { y: 0, animated: false });
  }, [highlightPostId, pageTab]);
  const lastFocusFetchAt = useRef(Date.now());
  const refetchChallenge = useRef(challengeQuery.refetch);
  const refetchRoster = useRef(roster.refetch);
  const refetchHostRound = useRef(hostRoundPrompt.refetch);
  refetchChallenge.current = challengeQuery.refetch;
  refetchRoster.current = roster.refetch;
  refetchHostRound.current = hostRoundPrompt.refetch;

  useEffect(() => {
    lastFocusFetchAt.current = Date.now();
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      if (!id) {
        return;
      }
      if (loggedParam) {
        scrollNodeTo(scrollRef.current, { y: 0, animated: false });
      }
      const now = Date.now();
      if (now - lastFocusFetchAt.current < 8000) {
        return;
      }
      lastFocusFetchAt.current = now;
      void refetchChallenge.current();
      void refetchRoster.current();
      void refetchHostRound.current();
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

  useEffect(() => {
    if (!id || !challenge || !shouldTickSettlements(challenge)) {
      return;
    }
    let cancelled = false;
    function runTick() {
      void trySettleIfEnded(id)
        .then((view) => {
          if (cancelled || !view) {
            return;
          }
          void settlementQuery.refetch();
          void challengeQuery.refetch();
          void refetchProfile();
        })
        .catch(() => undefined);
    }
    runTick();
    const readyAt = settlementReviewReadyAt(challenge);
    const waitMs = readyAt ? readyAt.getTime() - Date.now() : 0;
    const later = waitMs > 0 ? setTimeout(runTick, waitMs + 250) : null;
    return () => {
      cancelled = true;
      if (later) {
        clearTimeout(later);
      }
    };
  }, [id, challenge?.status, challenge?.ends_at, challenge?.starts_at, challenge?.distributed_at]);

  const goalLogKey = useRef<string | null>(null);
  useEffect(() => {
    if (!challenge) {
      return;
    }
    const cumulative = usesCumulativeScoring(challenge);
    const classicPoints =
      isPointsChallenge(challenge) && challenge.scoring_method !== 'comparable_points';
    if (!cumulative && !classicPoints) {
      return;
    }
    const raw = cumulative
      ? rawCumulativeTargetMeters(challenge)
      : Math.max(Number(challenge.target_count) || 0, 0);
    if (raw > 0) {
      return;
    }
    if (goalLogKey.current === challenge.id) {
      return;
    }
    goalLogKey.current = challenge.id;
    const unit = cumulative ? athleteDistanceUnit() : 'points';
    const logged = cumulative
      ? Math.max(Number(participation?.distance_meters_total) || 0, 0)
      : Math.max(Number(participation?.points) || 0, 0);
    const target = cumulative ? cumulativeTargetMeters(challenge) : pointsGoalTarget(challenge);
    console.log('[blob:goal]', { challengeId: challenge.id, logged, target, unit });
  }, [challenge, participation]);

  function goBackFromDetail() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace(returnTo === 'feed' ? '/feed' : LOBBY_HREF);
  }

  const closePaidReceipt = useCallback(() => {
    setReceiptOpen(false);
    setPageTab('overview');
    if (id && receiptParam === '1') {
      router.replace(
        challengeDetailHref(id, returnTo === 'feed' ? 'feed' : 'lobby', null, { tab: 'overview' }),
      );
    }
  }, [id, receiptParam, returnTo, router]);

  useEffect(() => {
    if (receiptParam !== '1') {
      return;
    }
    if (overviewMoneyPhase(challenge, new Date()) !== 'settled') {
      return;
    }
    setReceiptOpen(true);
    setPageTab('overview');
  }, [challenge, receiptParam, settlementQuery.data]);

  const stillLoading =
    waitingForId ||
    (Boolean(id) && (challengeQuery.isLoading || challengeQuery.isFetching) && !challenge);

  if (stillLoading) {
    return (
      <Screen>
        <Stack.Screen
          options={{
            title: '',
            headerTitle: () => null,
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
    const kind = loadKind ?? (challengeQuery.isError ? 'server' : 'unavailable');
    const server = kind === 'server';
    const title =
      kind === 'geo'
        ? copy('geo.unavailable')
        : kind === 'private'
          ? copy('challenge.private')
          : server
            ? 'Something went wrong'
            : copy('challenge.unavailable');
    return (
      <Screen>
        <Stack.Screen
          options={{
            title: '',
            headerBackVisible: false,
            headerLeft: () => <StackBackButton />,
            headerRight: () => <ChallengeDetailHeaderRight />,
          }}
        />
        <MascotState
          kind={server ? 'error' : 'empty'}
          title={title}
          body={server ? 'Try again in a moment.' : undefined}
          actionLabel={server ? 'Retry' : 'Back'}
          onAction={server ? () => void challengeQuery.refetch() : goBackFromDetail}
        />
      </Screen>
    );
  }

  function onJoinPress() {
    if (joinSheet.loading || !challenge || isHost || isJoined || !canJoinBase) {
      return;
    }
    if (challenge.is_official && !officialDob.ensureAdult()) {
      return;
    }
    if (needsBodyMetrics) {
      router.push(BODY_METRICS_HREF);
      return;
    }
    if (needsTopUp) {
      setActionError(INSUFFICIENT_JOIN_COPY);
      wallet?.openWallet();
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
      onSuccess: () => {
        setSettleOpen(false);
        setPageTab('overview');
        scrollNodeTo(scrollRef.current, { y: 0, animated: false });
      },
      onError: (error) => {
        setActionError(settlementErrorCopy(error));
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

  const tasks = Array.isArray(challenge.tasks) ? challenge.tasks : [];
  const proofSteps = requiredChallengeProofs(challenge);
  const comparable = usesComparablePointsScoring(challenge);
  const comparableConfig = comparable ? comparablePointsFromChallenge(challenge) : null;
  const isPoints = isPointsChallenge(challenge) && !comparable;
  const isUnlimited = isUnlimitedChallenge(challenge);
  const totalCount = usesTotalCountCheckins(challenge);
  const ruleCopy = challengeRuleCopy(challenge);
  const previewHero = Boolean(challenge.preview_hero);
  const showDayRing = !previewHero && isJoined && usesConsistencyExperience(challenge);
  const checkinTarget = challengeTargetCount(challenge);
  const target = totalCount ? checkinTarget : durationDays;
  const submittedCount = Math.max(
    submittedCheckins.data ?? 0,
    loggedToday && !totalCount ? 1 : 0,
  );
  const checkinLocked = totalCount ? submittedCount >= checkinTarget : loggedToday;
  const logTitle = checkinLocked
    ? copy('checkin.checkedIn')
    : (periodCheckin.data?.ctaTitle ?? copy('checkin.begin'));
  const proofHeadline = comparable
    ? proofSteps.length <= 1
      ? 'Proof'
      : 'Required proof'
    : proofSteps.length === 1
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
  const autoSettle = isEvenSplitAutoSettle(challenge);
  const showJudgingUi =
    !autoSettle &&
    !isUnlimited &&
    hasChallengeEnded(challenge, new Date(nowMs)) &&
    challenge.status !== 'settled' &&
    challenge.status !== 'cancelled' &&
    challenge.status !== 'settling';
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
  const hasCheckins = (submittedCheckins.data ?? 0) > 0 || loggedToday;
  const startNeeded =
    challenge.status === 'live' || hasCheckins
      ? null
      : userStartNeededLabel(challenge, competitorCount);
  const goalLabel =
    previewHero && !challengeHasDurationHint(challenge)
      ? ''
      : challengeGoalLabel(challenge, {
          daysCompleted,
          taskCount: Math.max(tasks.length, 1),
          distanceMetersCompleted: participation?.distance_meters_total ?? 0,
          pointsCompleted: participation?.points ?? 0,
          metricTotals: participation?.metric_totals,
        });
  const moneyPhase = overviewMoneyPhase(challenge, new Date(nowMs));
  const prizeEnded = moneyPhase === 'settled' || moneyPhase === 'ended';
  const prizeVoidKind = settlement
    ? settlementVoidKind({
        winnerCount: settlement.settlement.winner_count,
        payouts: settlement.payouts,
        slices: settlement.settlement.slices,
      })
    : null;
  const prizeForfeited = prizeEnded && Boolean(settlement) && prizeVoidKind != null;
  const voidRuleLine = nobodyFinishedRuleCopy(challenge);
  const progressRatio = isUnlimited
    ? 1
    : daysCompleted / Math.max(isPoints ? Math.max(tasks.length, 1) : target, 1);
  const startLine =
    waitingToStart && challenge.status !== 'live' && !hasCheckins
      ? startsInLabel(challenge, new Date(nowMs)) ??
        startNeeded ??
        copy('challenge.waitingToStart')
      : null;
  const stickyJoin = !isCalloutObserver && !isJoined && (needsBodyMetrics || canJoin || needsTopUp);
  const stickyCheckin =
    isJoined &&
    !isCalloutObserver &&
    challenge.status === 'live' &&
    !participation?.eliminated_at &&
    !waitingToStart &&
    !logsClosed;
  const showStickyCta =
    challenge.status !== 'settled' &&
    challenge.status !== 'cancelled' &&
    (stickyJoin || stickyCheckin);
  const tabClearance = tabBarLift(insets.bottom, 'sticky');
  const stickyBlock = showStickyCta
    ? JOIN_CTA_HEIGHT +
      (!checkinLocked && watch.visible ? 44 : 12) +
      (!checkinLocked && periodDueClock ? 40 : 0)
    : 0;

  return (
    <ChallengeNotesProvider>
    <Screen padded={false} edges={['left', 'right']} keyboardAvoiding={pageTab !== 'feed'}>
      <Stack.Screen
        options={{
          title: '',
          headerTitle: () => <ChallengeStackTitle challenge={challenge} />,
          headerTitleContainerStyle: { flex: 1, minWidth: 0, maxWidth: '100%' },
          headerRightContainerStyle: { flexGrow: 0, flexShrink: 0 },
          headerLeftContainerStyle: { flexGrow: 0, flexShrink: 0 },
          headerBackVisible: false,
          headerLeft: () => <StackBackButton />,
          headerRight: () => <ChallengeDetailHeaderRight />,
        }}
      />
      <View style={{ paddingHorizontal: 16, paddingTop: 4 }}>
        <ChallengePageTabs
          value={pageTab}
          onChange={setPageTab}
          options={isCalloutObserver ? CHALLENGE_LIVE_ONLY_TABS : undefined}
        />
      </View>
      {pageTab === 'feed' ? (
        <View style={{ flex: 1, minHeight: 0 }}>
          {challenge?.is_callout ? (
            <CalloutLiveWatchChip watching={isCalloutObserver} count={watchingCount} />
          ) : null}
          <LiveThread
          posts={feed.data ?? []}
          isLoading={feed.isLoading}
          isRefreshing={refreshing}
          error={feed.error instanceof Error ? feed.error.message : null}
          highlightPostId={highlightPostId}
          currentUserId={user?.id}
          emptyTitle="Quiet in this challenge"
          emptyBody={
            isCalloutObserver
              ? CALLOUT_WATCHING_LINE
              : isJoined
              ? participation?.eliminated_at
                ? 'You’re out, but you can still watch the check-ins.'
                : copy('checkin.emptyBob')
              : 'Join the challenge to post in Live.'
          }
          canCompose={(isCalloutObserver || isJoined) && !participation?.eliminated_at}
          composing={createPost.isPending}
          memberIds={mentionMemberIds}
          placeholder={isCalloutObserver ? CALLOUT_CHEER_PLACEHOLDER : undefined}
          footerReserve={stickyJoin ? stickyBlock : 0}
          onRefresh={() => void onRefresh()}
          onRetry={() => void feed.refetch()}
          onCompose={(input) => createPost.mutateAsync(input)}
          onReact={(post, type, commentId) => toggleLiveReaction.mutate({ post, type, commentId })}
        />
        </View>
      ) : (
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
        {pageTab === 'overview' ? (
        <View>
        <View style={{ marginTop: 8 }}>
          <ChallengeHeroCard
            challenge={challenge}
            host={heroHost}
            viewerId={user?.id}
            calloutParty={calloutParty}
            watchingCount={watchingCount}
            joined={isJoined}
            hosting={isHost && !isJoined}
            invited={inviteOnly && !isHost && !isJoined}
            showNotJoined={!isJoined && !isHost && !isCalloutObserver}
            goalLabel={goalLabel}
            daysCompleted={daysCompleted}
            progressRatio={progressRatio}
            nowMs={nowMs}
            showProgressRing={showDayRing}
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
        {pageTab === 'overview' && hostRoundPrompt.visible && !isCalloutObserver ? (
          <View className="mt-3">
            <HostRoundPromptChip
              line={hostRoundPrompt.line}
              onPress={() => {
                if (!id) {
                  return;
                }
                router.push(captureHref('reel', 'video', { challengeId: id }));
              }}
              onDismiss={() => hostRoundPrompt.dismiss()}
            />
          </View>
        ) : null}
        {pageTab === 'overview' && challenge?.is_callout && !isCalloutObserver ? (
          <CalloutHonorCard challengeId={challenge.id} />
        ) : null}
        {pageTab === 'overview' && calloutQuery.data?.status === 'settled' && isCalloutFighterViewer ? (
          <View className="mt-3">
            <CalloutRematchButton callout={calloutQuery.data} me={user?.id} />
          </View>
        ) : null}
        {pageTab === 'overview' && calloutQuery.data && isCalloutFighterViewer ? (
          <CalloutWatchers callout={calloutQuery.data} me={user?.id} isFighter />
        ) : null}
        {pageTab === 'overview' && !loggedToday && !isCalloutObserver ? (
          <View className="mt-3">
            <PeriodCheckinDue challenge={challenge} submitted={false} nowMs={nowMs} />
          </View>
        ) : null}
        {challenge.description?.trim() ? (
          <AppText className="mt-3 text-[15px] leading-6" style={{ color: THEME.textPrimary }}>
            {challenge.description.trim()}
          </AppText>
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

        <View className="mt-4">
          <ChallengeLifecycleStatus status={challenge.status} />
        </View>
        {pageTab === 'overview' && !isCalloutObserver ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View board"
            onPress={() => setPageTab('board')}
            className="mt-3"
            style={{ minHeight: 44, justifyContent: 'center' }}>
            <AppText className="text-[15px] font-semibold" style={{ color: THEME.accent }}>
              View board
            </AppText>
          </Pressable>
        ) : null}

        {moneyPhase === 'ended' && !receipt ? (
          <Card className="mt-4">
            <AppText className="font-semibold text-charcoal">Ended</AppText>
            <AppText className="mt-1 text-sm leading-5 text-muted">
              {WRAPPING_UP_PROOFS_COPY}
            </AppText>
          </Card>
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
            <ChallengeDetailsCard challenge={challenge} missesUsed={periodMisses.data ?? 0} />
            {Boolean(receipt) || moneyPhase === 'ended' ? null : (
              <View className="mt-4">
                <OfficialMoneyBoard
                  challenge={challenge}
                  finished={finishers}
                  standing={challenge.status === 'live' ? standingLine : null}
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
                {tasks.map((task, index) => (
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
              {comparable ? 'Scoring' : isPoints ? 'Task points' : isUnlimited ? 'Stay eligible' : 'To finish'}
            </AppText>
            <AppText className="mt-1 text-xl font-bold text-charcoal">
              {comparable && comparableConfig
                ? comparablePointsHeadline(comparableConfig)
                : isPoints
                  ? `${totalTaskPoints(tasks)} pts`
                  : challenge.is_official
                    ? challengeGoalLabel(challenge)
                    : ruleCopy.toFinish || challenge.task?.trim() || ruleCopy.cadenceLong}
            </AppText>
          {comparable && comparableConfig ? (
              <AppText className="mt-1 text-xs leading-4 text-muted">
                {comparablePointsLiveSentence(comparableConfig)}
              </AppText>
            ) : isPoints || isUnlimited || challenge.is_official || !ruleCopy.totalHint ? null : (
              <AppText className="mt-1 text-xs leading-4 text-muted">{ruleCopy.totalHint}</AppText>
            )}
          </View>
          {isPoints || usesPointsBoard(challenge) || proofSteps.length === 0 ? null : (
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
                      {(proof.method === 'hr' || proof.method === 'distance') &&
                      periodCheckin.data?.proof_parts?.[proof.id]?.healthWorkoutId ? (
                        <HealthProofCaption
                          healthWorkoutId={periodCheckin.data.proof_parts[proof.id].healthWorkoutId}
                        />
                      ) : (
                        proof.method === 'location' ? (
                          <LocationVenueLine place={parseLocationPlace(proof.place)} />
                        ) : (
                        <AppText className="text-[13px] leading-5 text-muted">
                          {proof.method === 'honor' ? 'Honor. Confirm to check in.' : methodLabel(proof.method)}
                        </AppText>
                        )
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
          {challengeShowsMissBudget(challenge) ? (
            <View className="mt-2">
              <MissBudgetLines challenge={challenge} used={periodMisses.data ?? 0} />
            </View>
          ) : null}
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
          {voidRuleLine ? (
            <View className="mt-3">
              <RuleLine text={voidRuleLine} />
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

        {wasCancelled ? null : moneyPhase === 'settled' && receipt ? (
        <View className="mt-4">
          <ChallengeResultCard challenge={challenge} settlement={receipt} userId={user?.id} />
        </View>
        ) : moneyPhase === 'ended' ? null : challenge.is_official ? null : isCalloutObserver ? null : (
        <Card className="mt-4">
          <FieldNoteLabel
            note="pot"
            textClassName="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Prize
          </FieldNoteLabel>
          {prizeForfeited ? (
            <AppText className="mt-2 text-[17px] font-semibold leading-6 text-charcoal">
              {voidReceiptCopy(prizeVoidKind)}
            </AppText>
          ) : (
            <View className="mt-2">
              <ChallengePrizeLine challenge={challenge} />
              {challenge.status === 'live' && standingLine ? (
                <AppText className="mt-2 text-sm leading-5 text-muted">{standingLine}</AppText>
              ) : null}
            </View>
          )}
          {isHost ? (
            <View className="mt-4">
              <HostPrizeTopUp challenge={challenge} isHost={isHost} />
            </View>
          ) : null}
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

        </View>
        ) : null}

        {pageTab === 'board' && !isCalloutObserver ? (
          <View className="mt-4">
            <ChallengeLeaderboard
              challenge={challenge}
              roster={boardRoster}
              completedUserIds={completions.data ?? new Set()}
              joined={isJoined}
              viewerId={user?.id}
              settlement={moneyPhase === 'settled' ? receipt : null}
              showReceipt={false}
              onOpenReceipt={
                moneyPhase === 'settled' && receipt
                  ? () => {
                      setReceiptOpen(true);
                      setPageTab('overview');
                    }
                  : undefined
              }
              error={roster.error instanceof Error ? roster.error.message : null}
              missesUsed={periodMisses.data ?? 0}
            />
          </View>
        ) : null}

      </ScrollView>
      )}

      {showStickyCta && (pageTab !== 'feed' || stickyJoin) ? (
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 20,
          paddingHorizontal: 16,
          paddingTop: 8,
          backgroundColor: THEME.background,
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
          <View className="gap-2">
            {checkinLocked ? null : (
              <PeriodCheckinDue
                challenge={challenge}
                submitted={false}
                nowMs={nowMs}
                compact
                align="center"
              />
            )}
            {checkinLocked ? (
              <View
                accessibilityRole="button"
                accessibilityLabel={copy('checkin.checkedIn')}
                accessibilityState={{ disabled: true }}
                style={{
                  height: JOIN_CTA_HEIGHT,
                  width: '100%',
                  backgroundColor: THEME.accent,
                  borderRadius: THEME.radiusSm,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}>
                <Glyph name={GLYPH.check} color={THEME.accentForeground} size={18} />
                <AppText className="text-[16px] font-semibold" style={{ color: THEME.accentForeground }}>
                  {copy('checkin.checkedIn')}
                </AppText>
              </View>
            ) : (
              <Button
                title={logTitle}
                size="md"
                variant="primary"
                onPress={() => {
                  if (!id) {
                    return;
                  }
                  pushChallengeHref(router, String(checkinSubmitHref(id)), 'live-begin', id, pathname);
                }}
              />
            )}
            {!checkinLocked && watch.visible ? (
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

      {receipt && moneyPhase === 'settled' ? (
        <PaidReceiptOverlay
          visible={receiptOpen}
          challenge={challenge}
          settlement={receipt}
          userId={user?.id}
          joined={isJoined}
          onClose={closePaidReceipt}
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
