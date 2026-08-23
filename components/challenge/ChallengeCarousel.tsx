import { ScrollView, useWindowDimensions, View } from 'react-native';

import { ChallengeCard } from '@/components/challenge/ChallengeCard';
import { type MenuAnchor } from '@/components/challenge/ChallengeOverflowMenu';
import { AppText } from '@/components/ui/AppText';
import { canCancelChallengeCard } from '@/lib/challengeCancel';
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

const CARD_GAP = 10;

export function ChallengeCarousel({
  title,
  challenges,
  currentUserId,
  progressById,
  socialProofById,
  onPress,
  allowCancel = false,
  official = false,
  onOverflow,
}: ChallengeCarouselProps) {
  const { width } = useWindowDimensions();
  if (challenges.length === 0) {
    return null;
  }
  const cardWidth = Math.min(Math.round(width * 0.82), 400);
  const snap = cardWidth + CARD_GAP;

  return (
    <View className="mb-5">
      <AppText className="text-[18px] font-extrabold text-charcoal">{title}</AppText>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToInterval={snap}
        snapToAlignment="start"
        disableIntervalMomentum
        className="mt-2.5"
        contentContainerStyle={{ paddingRight: 16 }}>
        {challenges.map((challenge) => {
          const mine = progressById?.get(challenge.id);
          const hosting = Boolean(currentUserId && challenge.created_by === currentUserId);
          const joined = Boolean(mine);
          const showOverflow =
            allowCancel &&
            Boolean(onOverflow) &&
            canCancelChallengeCard({
              challenge,
              viewerId: currentUserId,
              official,
            });
          return (
            <View key={challenge.id} style={{ width: cardWidth, marginRight: CARD_GAP }}>
              <ChallengeCard
                variant="rail"
                challenge={challenge}
                myDays={joined ? mine?.days ?? 0 : null}
                joined={joined}
                hosting={hosting}
                socialProof={socialProofById?.get(challenge.id)}
                participantStatus={mine?.status}
                onPress={() => onPress(challenge.id)}
                onOverflow={
                  showOverflow && onOverflow
                    ? (anchor) => onOverflow(challenge, anchor)
                    : undefined
                }
              />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
