import { ScrollView, View } from 'react-native';

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
  layout?: 'stack' | 'rail';
  onOverflow?: (challenge: ChallengeWithStats, anchor: MenuAnchor) => void;
};

export function ChallengeCarousel({
  title,
  challenges,
  currentUserId,
  progressById,
  socialProofById,
  onPress,
  allowCancel = false,
  official = false,
  layout = 'stack',
  onOverflow,
}: ChallengeCarouselProps) {
  if (challenges.length === 0) {
    return null;
  }
  const rail = layout === 'rail';
  const cards = challenges.map((challenge) => {
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
    const card = (
      <ChallengeCard
        variant={rail ? 'rail' : 'discover'}
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
    );
    return (
      <View key={challenge.id} style={rail ? { width: 292 } : undefined}>
        {card}
      </View>
    );
  });

  return (
    <View className="mb-5">
      <AppText className="text-[18px] font-extrabold text-charcoal">{title}</AppText>
      {rail ? (
        <ScrollView
          horizontal
          nestedScrollEnabled
          directionalLockEnabled
          showsHorizontalScrollIndicator={false}
          className="mt-2.5"
          contentContainerStyle={{ gap: 8, paddingRight: 12 }}>
          {cards}
        </ScrollView>
      ) : (
        <View className="mt-2.5" style={{ gap: 12 }}>
          {cards}
        </View>
      )}
    </View>
  );
}
