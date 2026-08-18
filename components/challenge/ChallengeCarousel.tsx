import { ScrollView, View } from 'react-native';

import { ChallengeCard } from '@/components/challenge/ChallengeCard';
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
};

export function ChallengeCarousel({
  title,
  challenges,
  currentUserId,
  progressById,
  socialProofById,
  onPress,
}: ChallengeCarouselProps) {
  if (challenges.length === 0) {
    return null;
  }
  return (
    <View className="mb-5">
      <AppText className="text-[18px] font-extrabold text-charcoal">{title}</AppText>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        className="mt-2.5"
        contentContainerStyle={{ gap: 8, paddingRight: 12 }}>
        {challenges.map((challenge) => {
          const mine = progressById?.get(challenge.id);
          const hosting = Boolean(currentUserId && challenge.created_by === currentUserId);
          const joined = Boolean(mine);
          return (
            <ChallengeCard
              key={challenge.id}
              variant="rail"
              challenge={challenge}
              myDays={joined ? mine?.days ?? 0 : null}
              joined={joined}
              hosting={hosting}
              socialProof={socialProofById?.get(challenge.id)}
              participantStatus={mine?.status}
              onPress={() => onPress(challenge.id)}
            />
          );
        })}
      </ScrollView>
    </View>
  );
}
