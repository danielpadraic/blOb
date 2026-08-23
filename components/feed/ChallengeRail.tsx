import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { ChallengeCarousel } from '@/components/challenge/ChallengeCarousel';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useFeedActiveChallenges, useMyChallengeProgress } from '@/hooks/useChallenge';
import { copy } from '@/lib/copy';
import { isOfficialSeriesChallenge } from '@/lib/officialSeries';
import { challengeDetailHref } from '@/lib/routes';
import { THEME } from '@/lib/theme';

export function ChallengeRail() {
  const router = useRouter();
  const { user } = useAuth();
  const active = useFeedActiveChallenges();
  const mine = useMyChallengeProgress();

  const progressById = new Map(
    (mine.data ?? []).map((row) => [
      row.challenge_id,
      { days: Number(row.days_completed ?? 0), status: row.status ?? 'joined' },
    ]),
  );
  const activeRows = (active.data ?? []).filter((row) => !isOfficialSeriesChallenge(row));

  if (activeRows.length === 0) {
    return null;
  }

  function open(id: string) {
    router.push(challengeDetailHref(id, 'feed'));
  }

  return (
    <View>
      <ChallengeCarousel
        title={copy('feed.railActive')}
        challenges={activeRows}
        currentUserId={user?.id}
        progressById={progressById}
        onPress={open}
        layout="rail"
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
