import { ScrollView, useWindowDimensions, View } from 'react-native';

import { LobbyChallengeCard } from '@/components/challenge/LobbyChallengeCard';
import { type MenuAnchor } from '@/components/challenge/ChallengeOverflowMenu';
import { AppText } from '@/components/ui/AppText';
import type { ChallengeWithStats } from '@/lib/types';

export type CarouselSocialProof = {
  name: string;
  avatarUrl?: string | null;
  kind: 'hosting' | 'joined';
};

type ChallengeCarouselProps = {
  title: string;
  challenges: ChallengeWithStats[];
  currentUserId?: string;
  progressById?: Map<string, { days: number; status: string }>;
  socialProofById?: Map<string, CarouselSocialProof>;
  onPress: (id: string) => void;
  allowCancel?: boolean;
  official?: boolean;
  onOverflow?: (challenge: ChallengeWithStats, anchor: MenuAnchor) => void;
};

const CARD_GAP = 14;

export function ChallengeCarousel({
  title,
  challenges,
  currentUserId,
  progressById,
  onPress,
}: ChallengeCarouselProps) {
  const { width } = useWindowDimensions();
  if (challenges.length === 0) {
    return null;
  }
  const cardWidth = Math.min(Math.round(width * 0.82), 400);

  return (
    <View className="mb-5">
      <AppText className="text-[18px] font-extrabold text-charcoal">{title}</AppText>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={cardWidth + CARD_GAP}
        snapToAlignment="start"
        disableIntervalMomentum
        className="mt-2.5"
        contentContainerStyle={{ paddingRight: 16 }}>
        {challenges.map((challenge) => {
          const mine = progressById?.get(challenge.id);
          const hosting = Boolean(currentUserId && challenge.created_by === currentUserId);
          return (
            <View key={challenge.id} style={{ width: cardWidth, marginRight: CARD_GAP }}>
              <LobbyChallengeCard
                challenge={challenge}
                joined={Boolean(mine)}
                hosting={hosting}
                onPress={() => onPress(challenge.id)}
              />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
