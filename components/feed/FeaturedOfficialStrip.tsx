import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import { useJoinConfirm } from '@/components/challenge/JoinConfirmHost';
import { TourAnchor } from '@/components/tour/TourAnchor';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useFeaturedOfficialChallenge, useMyChallengeProgress } from '@/hooks/useChallenge';
import { useMyProfile } from '@/hooks/useProfile';
import { hasCompletedBodyMetrics } from '@/lib/bodyMetrics';
import { formatCashCompact } from '@/lib/currency';
import {
  armingCountdownLabel,
  isOfficialJoinable,
  officialContestantsNeeded,
} from '@/lib/officialSeries';
import { openChallengeLobby } from '@/lib/challengeOpen';
import { BODY_METRICS_HREF } from '@/lib/routes';
import { THEME } from '@/lib/theme';

const BLOB_WORDMARK = require('@/assets/mascot/blob-logo.png');
const BAR = '#123832';

export function FeaturedOfficialStrip() {
  const router = useRouter();
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const featured = useFeaturedOfficialChallenge();
  const mine = useMyChallengeProgress();
  const joinSheet = useJoinConfirm();
  const [nowMs, setNowMs] = useState(() => Date.now());

  const challenge = featured.data ?? null;
  const joined = Boolean((mine.data ?? []).some((row) => row.challenge_id === challenge?.id));
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
  const guarantee = Math.max(Number(card.host_budget ?? card.creator_contribution) || 0, 0);
  const pot = Math.max(Number(card.prize_pool) || 0, 0);
  const needed = officialContestantsNeeded({ guarantee, pot, buyIn });
  const title = `Weekly ${formatCashCompact(guarantee || 10)}`;
  const joinLabel = `Join ${formatCashCompact(buyIn || 1)}`;
  const needsBodyMetrics = Boolean(user && card.is_official && !hasCompletedBodyMetrics(profile));

  let meta = '';
  if (card.status === 'arming') {
    meta = armingCountdownLabel(card.armed_at, new Date(nowMs)) ?? 'Starts in …';
  } else if (needed > 0) {
    meta = `${needed} to start`;
  } else {
    meta = 'Filling';
  }

  function openDetail() {
    if (!card.id) {
      return;
    }
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
      <View
        style={{
          minHeight: 40,
          borderRadius: 14,
          overflow: 'hidden',
          backgroundColor: BAR,
          flexDirection: 'row',
          alignItems: 'center',
          paddingVertical: 4,
          paddingRight: 6,
          paddingLeft: 8,
        }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${title}. ${meta}`}
          onPress={openDetail}
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 32,
            flexDirection: 'row',
            alignItems: 'center',
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
            style={{ width: 40, height: 16, backgroundColor: 'transparent' }}
            contentFit="contain"
            tintColor="#F7FFFC"
            accessibilityLabel="blOb"
          />
          <View className="min-w-0 flex-1" style={{ paddingHorizontal: 10 }}>
            <AppText
              className="text-[13px] font-extrabold"
              numberOfLines={1}
              style={{ color: '#FFFFFF' }}>
              {title}
            </AppText>
            {meta ? (
              <AppText
                className="mt-0.5 text-[11px] font-semibold"
                numberOfLines={1}
                style={{ color: 'rgba(231, 247, 243, 0.72)' }}>
                {meta}
              </AppText>
            ) : null}
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={joinLabel}
          disabled={joinSheet.loading}
          onPress={onJoin}
          style={{
            minHeight: 32,
            paddingHorizontal: 12,
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
      </View>
    </TourAnchor>
  );
}
