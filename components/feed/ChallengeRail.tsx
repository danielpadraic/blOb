import { useRouter } from 'expo-router';
import { Pressable, ScrollView, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { StakeAmount } from '@/components/currency/CurrencyMark';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useChallenges, useMyChallengeProgress } from '@/hooks/useChallenge';
import { isPointsChallenge, totalTaskPoints } from '@/lib/challenges';
import { joinedProgressCopy } from '@/lib/challengeRuleCopy';
import { CHALLENGE_STATUS_LABEL } from '@/lib/constants';
import { challengeDetailHref } from '@/lib/routes';
import { THEME, themeShadow } from '@/lib/theme';
import { isSponsoredBucks } from '@/lib/currency';
import { lobbyTimeLabel } from '@/utils/format';

const CARD_WIDTH = 230;
const CARD_HEIGHT = 150;

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
          hitSlop={8}>
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
            accessibilityLabel="Create a Challenge">
            <LinearGradient
              colors={['#2C9B89', '#1F7A6C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0.2, y: 1 }}
              style={{
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
                borderRadius: 22,
                padding: 14,
                justifyContent: 'space-between',
                ...themeShadow('card'),
              }}>
              <View
                className="h-9 w-9 items-center justify-center"
                style={{ borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.18)' }}>
                <AppText className="font-bold" style={{ color: '#fff', fontSize: 22, lineHeight: 24 }}>
                  +
                </AppText>
              </View>
              <View>
                <AppText className="text-[16px] font-extrabold leading-5" style={{ color: '#fff' }}>
                  Create a Challenge
                </AppText>
                <AppText className="mt-0.5 text-[11px]" style={{ color: 'rgba(255,255,255,0.82)' }}>
                  Set the stakes
                </AppText>
              </View>
            </LinearGradient>
          </Pressable>
        ) : null}
        {rows.map((challenge) => {
          const joined = user ? progress.get(challenge.id) : undefined;
          const progressCopy = joined
            ? joinedProgressCopy(challenge, joined.days_completed)
            : null;
          const ratio = progressCopy?.ratio ?? 0;
          return (
            <Pressable
              key={challenge.id}
              onPress={() => router.push(challengeDetailHref(challenge.id, 'feed'))}
              accessibilityRole="button"
              accessibilityLabel={challenge.title}
              style={{
                width: CARD_WIDTH,
                height: CARD_HEIGHT,
                backgroundColor: THEME.surface,
                borderColor: THEME.border,
                borderWidth: 1,
                borderRadius: 22,
                padding: 12,
                ...themeShadow('card'),
              }}>
              <View className="flex-1 justify-between">
                <View>
                  <View className="flex-row items-start justify-between gap-2">
                    <View className="min-w-0 flex-1 flex-row flex-wrap items-center" style={{ gap: 4 }}>
                      {challenge.is_official ? (
                        <Tag label={isSponsoredBucks(challenge) ? 'Sponsored' : 'Official'} dark />
                      ) : null}
                      {frequencyTag(challenge.frequency) ? (
                        <Tag label={frequencyTag(challenge.frequency)!} dark />
                      ) : null}
                      {joined ? <Tag label="Joined" mint /> : null}
                    </View>
                    {joined && progressCopy ? (
                      <ProgressRing
                        progress={ratio}
                        size={36}
                        strokeWidth={4}
                        label={`${Math.round(ratio * 100)}`}
                        labelClassName="text-[9px] font-extrabold text-charcoal"
                      />
                    ) : null}
                  </View>
                  <AppText
                    className="mt-2 text-[15px] font-extrabold leading-5 text-charcoal"
                    numberOfLines={2}>
                    {challenge.title}
                  </AppText>
                </View>
                <View>
                  <View className="flex-row items-center justify-between">
                    <StakeAmount
                      amount={challenge.buy_in_amount}
                      currency={challenge.currency}
                      size={12}
                      freeLabel={isSponsoredBucks(challenge) ? 'Free · $' : 'Free'}
                      textClassName="text-[11px] font-semibold text-muted"
                    />
                    <AppText className="text-[11px] text-muted" numberOfLines={1}>
                      {lobbyTimeLabel(challenge)}
                    </AppText>
                  </View>
                  {joined && progressCopy ? (
                    <View
                      className="mt-2 h-[3px] overflow-hidden rounded-full"
                      style={{ backgroundColor: THEME.border }}>
                      <View
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, ratio * 100)}%`,
                          backgroundColor: THEME.accent,
                        }}
                      />
                    </View>
                  ) : (
                    <AppText className="mt-1.5 text-[11px] text-muted" numberOfLines={1}>
                      {challenge.status === 'open' ||
                      challenge.status === 'upcoming' ||
                      challenge.status === 'in_progress'
                        ? isPointsChallenge(challenge)
                          ? `${challenge.tasks.length} tasks · ${totalTaskPoints(challenge.tasks)} pts`
                          : 'Open to join'
                        : CHALLENGE_STATUS_LABEL[challenge.status] ?? challenge.status}
                    </AppText>
                  )}
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

function frequencyTag(frequency: string | null | undefined) {
  if (frequency === 'weekly') return 'Weekly';
  if (frequency === 'monthly') return 'Monthly';
  if (frequency === 'once') return 'Once';
  if (frequency === 'daily') return 'Daily';
  return null;
}

function Tag({
  label,
  dark,
  mint,
}: {
  label: string;
  dark?: boolean;
  mint?: boolean;
}) {
  return (
    <View
      className="self-start rounded-full"
      style={{
        backgroundColor: dark ? THEME.primary : mint ? THEME.accentSoft : THEME.surface2,
        paddingHorizontal: 7,
        paddingVertical: 3,
      }}>
      <AppText
        className="text-[9px] font-extrabold uppercase"
        style={{
          color: dark ? THEME.primaryForeground : THEME.accent,
          letterSpacing: 0.4,
          lineHeight: 11,
        }}>
        {label}
      </AppText>
    </View>
  );
}
