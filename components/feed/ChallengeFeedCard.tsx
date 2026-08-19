import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';

import { ChallengeTagRow } from '@/components/challenge/ChallengeTag';
import { StakeAmount } from '@/components/currency/CurrencyMark';
import { AppText } from '@/components/ui/AppText';
import { challengeCardTags } from '@/lib/challengeTags';
import { CHALLENGE_STATUS_LABEL } from '@/lib/constants';
import type { FeedChallengePreview } from '@/lib/social';
import { THEME } from '@/lib/theme';

type ChallengeFeedCardProps = {
  challenge: FeedChallengePreview;
  joined?: boolean;
  won?: boolean;
  onPress?: () => void;
};

export function ChallengeFeedCard({ challenge, joined, won, onPress }: ChallengeFeedCardProps) {
  const status =
    CHALLENGE_STATUS_LABEL[challenge.status] ??
    String(challenge.status).replace(/_/g, ' ');

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={challenge.title}
      className="mt-3 flex-row overflow-hidden"
      style={{
        backgroundColor: THEME.background,
        borderWidth: 1,
        borderColor: joined || won ? THEME.accent : THEME.border,
        borderRadius: 16,
      }}>
      {challenge.cover_image_url ? (
        <Image
          source={{ uri: challenge.cover_image_url }}
          style={{ width: 72, height: 72, backgroundColor: THEME.surface2 }}
          contentFit="cover"
        />
      ) : (
        <View
          className="items-center justify-center"
          style={{ width: 72, height: 72, backgroundColor: THEME.accentSoft }}>
          <AppText className="text-[18px] font-extrabold" style={{ color: THEME.accent }}>
            {won ? '★' : 'C'}
          </AppText>
        </View>
      )}
      <View className="min-w-0 flex-1 justify-center px-3 py-2">
        <View className="flex-row flex-wrap items-center gap-1">
          <ChallengeTagRow
            tags={[
              ...challengeCardTags({ challenge, joined }),
              ...(won ? [{ kind: 'live' as const, label: 'Win' }] : []),
            ]}
          />
        </View>
        <AppText className="mt-1 text-[14px] font-extrabold leading-4 text-charcoal" numberOfLines={2}>
          {challenge.title}
        </AppText>
        <View className="mt-1 flex-row items-center gap-2">
          <StakeAmount
            amount={challenge.buy_in_amount}
            currency={challenge.currency}
            size={12}
            freeLabel="Free"
            textClassName="text-[11px] font-semibold text-muted"
          />
          <AppText className="text-[11px] text-muted">{status}</AppText>
        </View>
      </View>
    </Pressable>
  );
}
