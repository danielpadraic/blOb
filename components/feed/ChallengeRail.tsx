import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import {
  ChallengePosterCard,
  POSTER_HEIGHT,
  POSTER_RADIUS,
  POSTER_WIDTH,
} from '@/components/challenge/ChallengePosterCard';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useChallenges, useMyChallengeProgress } from '@/hooks/useChallenge';
import { challengeDetailHref } from '@/lib/routes';
import { THEME, themeShadow } from '@/lib/theme';

export function ChallengeRail() {
  const router = useRouter();
  const { user } = useAuth();
  const challenges = useChallenges();
  const mine = useMyChallengeProgress();

  const progress = new Map(
    (mine.data ?? []).map((row) => [row.challenge_id, row]),
  );

  const rows = [...(challenges.data ?? [])].sort((a, b) => {
    const aJoined = progress.has(a.id) ? 0 : 1;
    const bJoined = progress.has(b.id) ? 0 : 1;
    if (aJoined !== bJoined) {
      return aJoined - bJoined;
    }
    if (a.is_official !== b.is_official) {
      return a.is_official ? -1 : 1;
    }
    return 0;
  });

  if (rows.length === 0 && !user) {
    return null;
  }

  return (
    <View className="gap-2" style={{ marginHorizontal: -16 }}>
      <View className="flex-row items-end justify-between px-4">
        <AppText className="text-[18px] font-extrabold text-charcoal">Active challenges</AppText>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="View all challenges"
          onPress={() => router.push('/challenges')}
          hitSlop={12}
          style={{ minHeight: 44, justifyContent: 'center' }}>
          <AppText className="text-[12px] font-semibold" style={{ color: THEME.accent }}>
            View all
          </AppText>
        </Pressable>
      </View>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingBottom: 4 }}>
        {user ? (
          <Pressable
            onPress={() => router.push('/challenges/create')}
            accessibilityRole="button"
            accessibilityLabel="Create challenge"
            style={{ minHeight: 44 }}>
            <LinearGradient
              colors={['#DFF8F3', '#72D9CB']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={{
                width: POSTER_WIDTH,
                height: POSTER_HEIGHT,
                borderRadius: POSTER_RADIUS,
                padding: 16,
                justifyContent: 'space-between',
                ...themeShadow('card'),
              }}>
              <View
                className="items-center justify-center"
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: THEME.primary,
                }}>
                <AppText className="font-bold" style={{ color: '#fff', fontSize: 26, lineHeight: 28 }}>
                  +
                </AppText>
              </View>
              <View>
                <AppText className="text-[16px] font-extrabold leading-5 text-charcoal">
                  Create challenge
                </AppText>
                <AppText className="mt-0.5 text-[12px] text-muted">Set the stakes</AppText>
              </View>
            </LinearGradient>
          </Pressable>
        ) : null}
        {rows.map((challenge) => {
          const mineRow = user ? progress.get(challenge.id) : undefined;
          const joined = Boolean(mineRow);
          return (
            <ChallengePosterCard
              key={challenge.id}
              challenge={challenge}
              joined={joined}
              daysCompleted={mineRow?.days_completed ?? 0}
              participantStatus={mineRow?.status}
              onPress={() => router.push(challengeDetailHref(challenge.id, 'feed'))}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}
