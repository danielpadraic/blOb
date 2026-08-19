import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { ChallengeCarousel } from '@/components/challenge/ChallengeCarousel';
import { TourAnchor } from '@/components/tour/TourAnchor';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useFeedActiveChallenges, useMyChallengeProgress, useOfficialDiscoverChallenges } from '@/hooks/useChallenge';
import { copy } from '@/lib/copy';
import { challengeDetailHref } from '@/lib/routes';
import { THEME } from '@/lib/theme';

export function ChallengeRail() {
  const router = useRouter();
  const { user } = useAuth();
  const active = useFeedActiveChallenges();
  const official = useOfficialDiscoverChallenges();
  const mine = useMyChallengeProgress();

  const progressById = new Map(
    (mine.data ?? []).map((row) => [
      row.challenge_id,
      { days: Number(row.days_completed ?? 0), status: row.status ?? 'joined' },
    ]),
  );
  const activeRows = active.data ?? [];
  const officialRows = official.data ?? [];

  if (activeRows.length === 0 && officialRows.length === 0) {
    return null;
  }

  function open(id: string) {
    router.push(challengeDetailHref(id, 'feed'));
  }

  return (
    <View>
      <TourAnchor id="tour-official">
      <ChallengeCarousel
        title={copy('feed.railOfficial')}
        challenges={officialRows}
        currentUserId={user?.id}
        progressById={progressById}
        onPress={open}
      />
      </TourAnchor>
      <ChallengeCarousel
        title={copy('feed.railActive')}
        challenges={activeRows}
        currentUserId={user?.id}
        progressById={progressById}
        onPress={open}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="View all challenges"
        onPress={() => router.push('/challenges')}
        hitSlop={12}
        style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
        <AppText className="text-[12px] font-semibold" style={{ color: THEME.accent }}>
          View all
        </AppText>
      </Pressable>
    </View>
  );
}
