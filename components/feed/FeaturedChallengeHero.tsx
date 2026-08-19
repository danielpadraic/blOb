import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';

import { OfficialFillingStats } from '@/components/challenge/ChallengePosterCard';
import { JoinConfirmModal } from '@/components/challenge/JoinConfirmModal';
import { OfficialDayClock } from '@/components/challenge/OfficialDayClock';
import { OfficialInviteButton } from '@/components/challenge/OfficialInviteButton';
import { BuckUsdAmount } from '@/components/currency/CurrencyMark';
import { TourAnchor } from '@/components/tour/TourAnchor';
import { AppText } from '@/components/ui/AppText';
import { officialBob } from '@/copy/officialBob';
import { useAuth } from '@/hooks/useAuth';
import { useFeaturedOfficialChallenge, useJoinChallenge, useMyChallengeProgress } from '@/hooks/useChallenge';
import { useMyProfile } from '@/hooks/useProfile';
import { useTodaySubmission } from '@/hooks/useWorkoutSubmission';
import { hasCompletedBodyMetrics } from '@/lib/bodyMetrics';
import { isLiveCompetitorStatus } from '@/lib/challenges';
import { copy } from '@/lib/copy';
import { isOfficialJoinable, isOfficialSeriesChallenge } from '@/lib/officialSeries';
import { BODY_METRICS_HREF, challengeDetailHref } from '@/lib/routes';
import { isClosedForLogs } from '@/lib/settlement';
import { THEME, themeShadow } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';

export function FeaturedChallengeHero() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useMyProfile();
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
      : 'Join';

  return (
    <View className="items-center">
      <AppText className="text-center text-[18px] font-extrabold text-charcoal">
        {copy('feed.featuredChallenge')}
      </AppText>
      <TourAnchor id="tour-official">
        <View
          className="mt-2.5 w-full"
          style={{
            backgroundColor: THEME.surface,
            borderColor: THEME.border,
            borderWidth: 1,
            borderRadius: THEME.radius,
            padding: 16,
            ...themeShadow('card'),
          }}>
          <Pressable
            onPress={openDetail}
            accessibilityRole="button"
            accessibilityLabel={card.title}>
            <StatusPill joined={joined} />
            <AppText className="mt-2 text-[18px] font-extrabold leading-6 text-charcoal">
              {card.title}
            </AppText>
            <View className="mt-3">
              <OfficialFillingStats challenge={card} nowMs={nowMs} showStartLine={joinable} />
            </View>
            {live && joined ? (
              <View className="mt-3">
                <OfficialDayClock challenge={card} now={new Date(nowMs)} variant="card" />
              </View>
            ) : null}
          </Pressable>
          {card.status === 'filling' ? (
            <OfficialInviteButton challengeId={card.id} challengeTitle={card.title} />
          ) : null}
          {live && !joined ? null : (
            <HeroCta
              title={primaryLabel}
              buyIn={joined || needsBodyMetrics ? null : buyIn}
              loading={join.isPending}
              onPress={onPrimary}
            />
          )}
        </View>
      </TourAnchor>
      <View className="mt-3 w-full">
        <AppText className="text-center text-[13px] font-semibold leading-5 text-charcoal">
          {officialBob('cardPromise')}
        </AppText>
        <AppText className="mt-1 text-center text-[12px] leading-5 text-muted">
          {officialBob('cardSplit')}
        </AppText>
      </View>
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

function StatusPill({ joined }: { joined: boolean }) {
  return (
    <View
      className="self-start rounded-full"
      style={{
        backgroundColor: joined ? THEME.accentSoft : THEME.surface2,
        paddingHorizontal: 10,
        paddingVertical: 5,
      }}>
      <AppText
        className="text-[11px] font-extrabold uppercase"
        style={{
          color: joined ? THEME.accent : THEME.textMuted,
          letterSpacing: 0.4,
        }}>
        {joined ? `✓  ${copy('feed.youreIn')}` : copy('feed.notJoined')}
      </AppText>
    </View>
  );
}

function HeroCta({
  title,
  buyIn,
  loading,
  onPress,
}: {
  title: string;
  buyIn: number | null;
  loading?: boolean;
  onPress: () => void;
}) {
  const joinWithAmount = buyIn != null && buyIn > 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={joinWithAmount ? `Join $${buyIn.toFixed(2)}` : title}
      disabled={loading}
      onPress={onPress}
      style={{
        minHeight: 48,
        marginTop: 12,
        borderRadius: 14,
        backgroundColor: THEME.primary,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
        opacity: loading ? 0.38 : 1,
        flexDirection: 'row',
        gap: 6,
      }}>
      <AppText className="text-[15px] font-semibold" style={{ color: THEME.primaryForeground }}>
        {title}
      </AppText>
      {joinWithAmount ? (
        <BuckUsdAmount
          amount={buyIn}
          size={16}
          color={THEME.primaryForeground}
          textClassName="text-[15px] font-semibold"
        />
      ) : null}
    </Pressable>
  );
}
