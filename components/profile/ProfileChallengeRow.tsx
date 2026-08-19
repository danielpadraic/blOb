import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { ChallengeTagRow } from '@/components/challenge/ChallengeTag';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';
import { CHALLENGE_STATUS_LABEL } from '@/lib/constants';
import type { ProfileChallenge } from '@/hooks/usePublicProfile';
import { challengeTargetCount, isPointsChallenge } from '@/lib/challenges';
import { StakeAmount } from '@/components/currency/CurrencyMark';
import { challengeCardTags } from '@/lib/challengeTags';

export function ProfileChallengeRow({ item }: { item: ProfileChallenge }) {
  const router = useRouter();
  const status = item.participation?.status
    ? item.participation.status === 'completed' || item.participation.completed_at
      ? 'Completed'
      : item.participation.eliminated_at
        ? 'Eliminated'
        : 'In play'
    : CHALLENGE_STATUS_LABEL[item.challenge.status] ?? item.challenge.status;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/challenges/${item.challenge.id}`)}
      className="px-3 py-2.5"
      style={{
        backgroundColor: THEME.surface,
        borderWidth: 1,
        borderColor: THEME.border,
        borderRadius: THEME.radius,
      }}>
      <View className="flex-row flex-wrap items-center gap-1.5">
        <Glyph
          name={item.participation ? GLYPH.check : GLYPH.flag}
          color={THEME.accent}
          size={13}
        />
        <ChallengeTagRow tags={challengeCardTags({ challenge: item.challenge })} />
        <AppText className="text-[11px] font-semibold text-muted">{status}</AppText>
      </View>
      <AppText className="mt-1 text-[14px] font-bold text-charcoal" numberOfLines={1}>
        {item.challenge.title}
      </AppText>
      <View className="mt-0.5 flex-row items-center">
        <StakeAmount
          amount={item.challenge.buy_in_amount}
          currency={item.challenge.currency}
          size={13}
          freeLabel="Free"
          textClassName="text-[11px] font-semibold text-muted"
        />
        {item.participation ? (
          <AppText className="ml-1 text-[11px] text-muted" numberOfLines={1}>
            · {item.participation.days_completed}/
            {isPointsChallenge(item.challenge)
              ? Math.max(item.challenge.tasks?.length || 1, 1)
              : challengeTargetCount(item.challenge)}{' '}
            {isPointsChallenge(item.challenge) ? 'tasks' : 'logs'}
          </AppText>
        ) : (
          <View className="ml-1 flex-row items-center">
            <AppText className="mr-1 text-[11px] text-muted">·</AppText>
            <StakeAmount
              amount={item.challenge.prize_pool}
              currency={item.challenge.currency}
              size={13}
              textClassName="text-[11px] font-semibold text-muted"
            />
          </View>
        )}
      </View>
    </Pressable>
  );
}
