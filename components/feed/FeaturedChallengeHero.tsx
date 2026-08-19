import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ChallengeHeroCard } from '@/components/challenge/ChallengeHeroCard';
import { JoinConfirmModal } from '@/components/challenge/JoinConfirmModal';
import { AppText } from '@/components/ui/AppText';
import { TourAnchor } from '@/components/tour/TourAnchor';
import { useAuth } from '@/hooks/useAuth';
import { useFeaturedOfficialChallenge, useJoinChallenge, useMyChallengeProgress } from '@/hooks/useChallenge';
import { useMyProfile } from '@/hooks/useProfile';
import { useWallet } from '@/hooks/useWallet';
import { useTodaySubmission } from '@/hooks/useWorkoutSubmission';
import { hasCompletedBodyMetrics } from '@/lib/bodyMetrics';
import { challengeGoalLabel } from '@/lib/challengeGoal';
import { isLiveCompetitorStatus } from '@/lib/challenges';
import { copy } from '@/lib/copy';
import { walletBalance } from '@/lib/currency';
import { bucksJoinCta } from '@/lib/joinCta';
import { isOfficialJoinable, isOfficialSeriesChallenge } from '@/lib/officialSeries';
import { BODY_METRICS_HREF, challengeDetailHref } from '@/lib/routes';
import { isClosedForLogs } from '@/lib/settlement';
import { THEME } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';

export function FeaturedChallengeHero() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const wallet = useWallet();
  const featured = useFeaturedOfficialChallenge();
  const mine = useMyChallengeProgress();
  const join = useJoinChallenge();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const challenge = featured.data ?? null;
  const participation = (mine.data ?? []).find((row) => row.challenge_id === challenge?.id);
  const joined = Boolean(participation && isLiveCompetitorStatus(participation.status));
  const joinable = Boolean(challenge && isOfficialJoinable(challenge));
  const live = Boolean(challenge && isOfficialSeriesChallenge(challenge) && challenge.status === 'live');
  const todaySubmission = useTodaySubmission(joined && live ? challenge?.id : undefined, challenge);
  const buyIn = Math.max(Number(challenge?.buy_in_amount) || 0, 0);
  const cta = bucksJoinCta({
    currency: challenge?.currency,
    buyIn,
    wallet: walletBalance(profile, challenge?.currency),
    hasProfile: Boolean(profile),
  });

  useEffect(() => {
    if (!joinable && !live) {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [joinable, live]);

  const logDue = useMemo(() => {
    if (!challenge || !joined || !live || participation?.eliminated_at) {
      return false;
    }
    if (isClosedForLogs({ ...challenge, eliminated: Boolean(participation?.eliminated_at) })) {
      return false;
    }
    if (todaySubmission.isLoading || todaySubmission.data) {
      return false;
    }
    return true;
  }, [challenge, joined, live, participation?.eliminated_at, todaySubmission.data, todaySubmission.isLoading]);

  if (!challenge) {
    return null;
  }

  const card = challenge;
  const needsBodyMetrics = Boolean(
    user && card.is_official && !joined && !hasCompletedBodyMetrics(profile),
  );

  function openDetail() {
    router.push(challengeDetailHref(card.id, 'feed'));
  }

  function onPrimary() {
    if (joined) {
      if (logDue) {
        router.push(`/challenges/${card.id}/submit`);
        return;
      }
      openDetail();
      return;
    }
    if (needsBodyMetrics) {
      router.push(BODY_METRICS_HREF);
      return;
    }
    if (cta.needsTopUp) {
      wallet.openTopUp({ amount: cta.shortfall, returnChallengeId: card.id });
      return;
    }
    setActionError(null);
    setConfirmOpen(true);
  }

  async function onConfirmJoin() {
    try {
      setActionError(null);
      await join.mutateAsync(card.id);
      setConfirmOpen(false);
    } catch (error) {
      setActionError(getErrorMessage(error));
    }
  }

  const primaryLabel = joined
    ? logDue
      ? copy('feed.logToday')
      : copy('feed.openChallenge')
    : needsBodyMetrics
      ? 'Add body metrics'
      : cta.needsTopUp
        ? cta.topUpLabel
        : cta.joinLabel;

  return (
    <View className="items-center">
      <AppText className="text-center text-[18px] font-extrabold text-charcoal">
        {copy('feed.featuredChallenge')}
      </AppText>
      <TourAnchor id="tour-official">
        <View className="mt-2.5 w-full">
          <ChallengeHeroCard
            challenge={card}
            viewerId={user?.id}
            joined={joined}
            showNotJoined
            goalLabel={challengeGoalLabel(card)}
            nowMs={nowMs}
            onOpen={openDetail}>
            {live && !joined ? null : (
              <HeroCta title={primaryLabel} loading={join.isPending} onPress={onPrimary} />
            )}
          </ChallengeHeroCard>
        </View>
      </TourAnchor>
      <JoinConfirmModal
        visible={confirmOpen}
        challenge={card}
        loading={join.isPending}
        error={actionError}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => {
          void onConfirmJoin();
        }}
      />
    </View>
  );
}

function HeroCta({
  title,
  loading,
  onPress,
}: {
  title: string;
  loading?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={loading}
      onPress={onPress}
      style={{
        minHeight: 48,
        marginTop: 4,
        borderRadius: 14,
        backgroundColor: THEME.primary,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        opacity: loading ? 0.38 : 1,
      }}>
      <AppText className="text-[15px] font-semibold" style={{ color: THEME.primaryForeground }}>
        {title}
      </AppText>
    </Pressable>
  );
}
