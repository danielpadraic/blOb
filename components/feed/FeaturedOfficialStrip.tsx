import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';

import { JoinConfirmModal } from '@/components/challenge/JoinConfirmModal';
import { BlobMascot } from '@/components/mascot/BlobMascot';
import { TourAnchor } from '@/components/tour/TourAnchor';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useFeaturedOfficialChallenge, useJoinChallenge, useMyChallengeProgress } from '@/hooks/useChallenge';
import { useMyProfile } from '@/hooks/useProfile';
import { useTodaySubmission } from '@/hooks/useWorkoutSubmission';
import { hasCompletedBodyMetrics } from '@/lib/bodyMetrics';
import { isLiveCompetitorStatus } from '@/lib/challenges';
import { copy, interpolateCopy } from '@/lib/copy';
import { formatCashCompact } from '@/lib/currency';
import { officialCurrentWindow, officialWindowsFor } from '@/lib/officialDays';
import {
  armingCountdownLabel,
  isOfficialJoinable,
  isOfficialSeriesChallenge,
  officialContestantsNeeded,
} from '@/lib/officialSeries';
import { BODY_METRICS_HREF, challengeDetailHref } from '@/lib/routes';
import { isClosedForLogs } from '@/lib/settlement';
import { THEME } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';

export function FeaturedOfficialStrip() {
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
  const arming = challenge?.status === 'arming';
  const todaySubmission = useTodaySubmission(joined && live ? challenge?.id : undefined, challenge);
  const buyIn = Math.max(Number(challenge?.buy_in_amount) || 0, 0);
  const guarantee = Math.max(Number(challenge?.host_budget ?? challenge?.creator_contribution) || 0, 0);

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
  const pot = Math.max(Number(card.prize_pool) || 0, 0);
  const needed = officialContestantsNeeded({ guarantee, pot, buyIn });
  const weeklyTitle = `Weekly ${formatCashCompact(guarantee || 10)}`;
  const windows = officialWindowsFor(card);
  const current = officialCurrentWindow(card, new Date(nowMs));
  const total = Math.max(windows.length, Number(card.days_required) || 7, 7);
  const dayLabel = interpolateCopy(copy('official.dayOf'), {
    n: current?.day ?? Math.min(Math.max(Number(participation?.days_completed) || 0, 0) + 1, total),
    total,
  });

  const title = joined && live ? dayLabel : weeklyTitle;
  let meta = '';
  let metaDone = false;
  if (joined && live) {
    if (logDue) {
      meta = 'Log today’s proof';
    } else if (todaySubmission.data) {
      meta = 'Done';
      metaDone = true;
    }
  } else if (arming) {
    meta = armingCountdownLabel(card.armed_at, new Date(nowMs)) ?? '';
  } else if (needed > 0) {
    meta = `${needed} to start`;
  }

  const showJoin = !joined && joinable;
  const showLog = joined && logDue;
  const ctaLabel = showJoin ? `Join ${formatCashCompact(buyIn || 1)}` : showLog ? 'Log' : null;

  function openDetail() {
    router.push(challengeDetailHref(card.id, 'feed'));
  }

  function onCta() {
    if (showLog) {
      router.push(`/challenges/${card.id}/submit`);
      return;
    }
    if (showJoin) {
      if (needsBodyMetrics) {
        router.push(BODY_METRICS_HREF);
        return;
      }
      setActionError(null);
      setConfirmOpen(true);
      return;
    }
    openDetail();
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

  return (
    <TourAnchor id="tour-official">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${meta}. ${joined ? 'Joined' : 'Not joined'}`}
        onPress={openDetail}
        style={{
          minHeight: 56,
          height: 60,
          borderRadius: 12,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: 'rgba(44, 155, 137, 0.16)',
        }}>
        <LinearGradient
          colors={['#E8F3EF', '#F6F5F1']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingRight: 6 }}>
          <View
            style={{
              width: 4,
              alignSelf: 'stretch',
              marginVertical: 8,
              marginLeft: 8,
              borderRadius: 4,
              backgroundColor: THEME.textPrimary,
            }}
          />
          <View style={{ width: 28, alignItems: 'center', justifyContent: 'center', marginLeft: 8 }}>
            <BlobMascot variant="logo" size={24} />
          </View>
          <View className="min-w-0 flex-1 px-2">
            <View className="flex-row items-center" style={{ gap: 6 }}>
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: joined ? THEME.accent : THEME.textMuted,
                }}
              />
              <AppText
                className="flex-1 text-[16px] font-semibold text-charcoal"
                numberOfLines={1}
                style={{ includeFontPadding: false }}>
                {title}
              </AppText>
            </View>
            {meta ? (
              <View className="mt-0.5 flex-row items-center" style={{ gap: 4 }}>
                {metaDone ? <Glyph name={GLYPH.check} color={THEME.accent} size={12} /> : null}
                <AppText className="flex-1 text-[12px] text-muted" numberOfLines={1}>
                  {meta}
                </AppText>
              </View>
            ) : null}
          </View>
          {ctaLabel ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={ctaLabel}
              disabled={join.isPending}
              onPress={onCta}
              style={{
                minHeight: 44,
                minWidth: 44,
                paddingHorizontal: 14,
                borderRadius: 999,
                backgroundColor: THEME.primary,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: join.isPending ? 0.38 : 1,
              }}>
              <AppText className="text-[13px] font-semibold" style={{ color: THEME.primaryForeground }}>
                {ctaLabel}
              </AppText>
            </Pressable>
          ) : (
            <View style={{ minHeight: 44, minWidth: 32, alignItems: 'center', justifyContent: 'center' }}>
              <AppText className="text-[20px] font-semibold text-muted">›</AppText>
            </View>
          )}
        </LinearGradient>
      </Pressable>
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
    </TourAnchor>
  );
}
