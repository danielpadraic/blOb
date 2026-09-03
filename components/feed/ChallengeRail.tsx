import { useMemo } from 'react';
import { useRouter, usePathname } from 'expo-router';
import { Pressable, View } from 'react-native';

import { ChallengeCarousel } from '@/components/challenge/ChallengeCarousel';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useFeedActiveChallenges, useMyChallengeProgress } from '@/hooks/useChallenge';
import { useMyProfile } from '@/hooks/useProfile';
import { copy } from '@/lib/copy';
import { isOfficialSeriesChallenge } from '@/lib/officialSeries';
import { openChallengeLobby } from '@/lib/challengeOpen';
import { personDisplayName } from '@/lib/social';
import { THEME } from '@/lib/theme';

export function ChallengeRail() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const active = useFeedActiveChallenges();
  const mine = useMyChallengeProgress();

  const progressById = new Map(
    (mine.data ?? []).map((row) => [
      row.challenge_id,
      {
        days: Number(row.days_completed ?? 0),
        status: row.status ?? 'joined',
        eliminated: Boolean(row.eliminated_at),
      },
    ]),
  );
  const activeRows = (active.data ?? []).filter((row) => !isOfficialSeriesChallenge(row));
  const selfHost = useMemo(
    () =>
      profile
        ? { name: personDisplayName(profile), avatarUrl: profile.avatar_url }
        : user
          ? { name: 'You' }
          : null,
    [profile, user],
  );

  if (activeRows.length === 0) {
    return null;
  }

  function open(id: string, snapshot?: (typeof activeRows)[number]) {
    openChallengeLobby(router, { id, snapshot, returnTo: 'feed', source: 'home-rail', pathname });
  }

  return (
    <View>
      <ChallengeCarousel
        title={copy('feed.railActive')}
        challenges={activeRows}
        currentUserId={user?.id}
        progressById={progressById}
        selfHost={selfHost}
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
