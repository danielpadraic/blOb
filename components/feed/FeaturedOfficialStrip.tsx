import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { useJoinConfirm } from '@/components/challenge/JoinConfirmHost';
import { TourAnchor } from '@/components/tour/TourAnchor';
import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { useAuth } from '@/hooks/useAuth';
import { useMyChallengeProgress } from '@/hooks/useChallenge';
import { useMyProfile } from '@/hooks/useProfile';
import { hasCompletedBodyMetrics } from '@/lib/bodyMetrics';
import { openChallengeLobby } from '@/lib/challengeOpen';
import { fetchOfficialDiscoverChallenges, withParticipantCounts } from '@/lib/challenges';
import { formatCashCompact } from '@/lib/currency';
import { fillGatePair } from '@/lib/lobbyChallenge';
import {
  armingCountdownLabel,
  isOfficialJoinable,
  officialGuaranteeAmount,
  OFFICIAL_WEEK_10_SLUG,
} from '@/lib/officialSeries';
import { BODY_METRICS_HREF } from '@/lib/routes';
import { THEME } from '@/lib/theme';
import type { ChallengeWithStats } from '@/lib/types';

const BLOB_WORDMARK = require('@/assets/mascot/blob-logo.png');
const BAR = '#123832';
const STRIP_MS = 2500;

function withStripTimeout<T>(run: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    run.catch(() => fallback),
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), STRIP_MS);
    }),
  ]);
}

function pickJoinableOfficial(
  rows: ChallengeWithStats[],
  joinedIds: Set<string>,
): ChallengeWithStats | null {
  const joinable = rows.filter((row) => isOfficialJoinable(row) && !joinedIds.has(row.id));
  return joinable.find((row) => row.series_id === OFFICIAL_WEEK_10_SLUG) ?? joinable[0] ?? null;
}

function officialHomeTitle(card: ChallengeWithStats): string {
  const guarantee = officialGuaranteeAmount(card) || 10;
  return `Weekly ${formatCashCompact(guarantee)}`;
}

export function FeaturedOfficialStrip() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const mine = useMyChallengeProgress();
  const joinSheet = useJoinConfirm();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const joinedIds = new Set((mine.data ?? []).map((row) => row.challenge_id));

  const featured = useQuery({
    queryKey: ['home-official-strip', user?.id],
    staleTime: 30_000,
    retry: false,
    queryFn: (): Promise<ChallengeWithStats | null> =>
      withStripTimeout(
        fetchOfficialDiscoverChallenges(user?.id)
          .then((rows) => withParticipantCounts(rows))
          .then((rows) => pickJoinableOfficial(rows, joinedIds)),
        null,
      ),
  });

  const challenge = featured.isError ? null : (featured.data ?? null);
  const joined = Boolean(challenge && joinedIds.has(challenge.id));
  const joinable = Boolean(challenge && isOfficialJoinable(challenge) && !joined);

  useEffect(() => {
    if (!joinable) {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [joinable]);

  if (!challenge || !joinable) {
    return null;
  }

  const card = challenge;
  const buyIn = Math.max(Number(card.buy_in_amount) || 0, 0);
  const title = officialHomeTitle(card);
  const joinLabel = `Join ${formatCashCompact(buyIn || 1)}`;
  const needsBodyMetrics = Boolean(user && card.is_official && !hasCompletedBodyMetrics(profile));
  const arming = card.status === 'arming' || Boolean(card.armed_at);
  const armingLine = arming
    ? armingCountdownLabel(card.armed_at, new Date(nowMs)) ?? 'Starts in …'
    : null;
  const fill = armingLine ? null : fillGatePair(card);
  const showFill = Boolean(fill && fill.count < fill.min);

  function openDetail() {
    openChallengeLobby(router, { id: card.id, snapshot: card, returnTo: 'feed' });
  }

  function onJoin() {
    if (needsBodyMetrics) {
      router.push(BODY_METRICS_HREF);
      return;
    }
    joinSheet.open(card);
  }

  return (
    <TourAnchor id="tour-official">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}. ${armingLine ?? (showFill && fill ? `${fill.count}/${fill.min} to start` : '')}. ${joinLabel}`}
        onPress={openDetail}
        style={{
          minHeight: 58,
          borderRadius: 18,
          overflow: 'hidden',
          backgroundColor: BAR,
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 8,
          paddingRight: 8,
          paddingLeft: 10,
        }}>
        <View
          style={{
            width: 3,
            alignSelf: 'stretch',
            marginVertical: 6,
            marginRight: 8,
            borderRadius: 2,
            backgroundColor: THEME.accent,
          }}
        />
        <Image
          source={BLOB_WORDMARK}
          style={{ width: 56, height: 22, backgroundColor: 'transparent' }}
          contentFit="contain"
          tintColor="#F7FFFC"
          accessibilityLabel="blOb"
        />
        <View className="min-w-0 flex-1" style={{ paddingHorizontal: 10 }}>
          <AppText
            className="text-[16px] font-extrabold"
            numberOfLines={1}
            style={{ color: '#FFFFFF' }}>
            {title}
          </AppText>
          {armingLine ? (
            <AppText
              className="mt-0.5 text-[12px] font-semibold"
              numberOfLines={1}
              style={{ color: 'rgba(231, 247, 243, 0.72)', fontVariant: ['tabular-nums'] }}>
              {armingLine}
            </AppText>
          ) : showFill && fill ? (
            <View className="mt-0.5 flex-row items-center" style={{ gap: 4, minWidth: 0 }}>
              <AppText
                className="text-[12px] font-semibold"
                numberOfLines={1}
                style={{ color: 'rgba(231, 247, 243, 0.72)', fontVariant: ['tabular-nums'] }}>
                {`${fill.count}/${fill.min}`}
              </AppText>
              <Glyph name={GLYPH.people} color="rgba(231, 247, 243, 0.72)" size={12} />
              <AppText
                className="text-[12px] font-semibold"
                numberOfLines={1}
                style={{ color: 'rgba(231, 247, 243, 0.72)' }}>
                to start
              </AppText>
            </View>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={joinLabel}
          disabled={joinSheet.loading}
          onPress={(event) => {
            event.stopPropagation();
            onJoin();
          }}
          style={{
            minHeight: 36,
            paddingHorizontal: 14,
            borderRadius: 999,
            backgroundColor: THEME.accent,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: joinSheet.loading ? 0.38 : 1,
          }}>
          <AppText className="text-[13px] font-extrabold" style={{ color: THEME.accentForeground }}>
            {joinLabel}
          </AppText>
        </Pressable>
      </Pressable>
    </TourAnchor>
  );
}
