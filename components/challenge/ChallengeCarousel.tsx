import { ScrollView, useWindowDimensions, View } from 'react-native';

import {
  ChallengeInviteCard,
  type InviteHost,
  type InviteSection,
} from '@/components/challenge/ChallengeInviteCard';
import { type MenuAnchor } from '@/components/challenge/ChallengeOverflowMenu';
import { AppText } from '@/components/ui/AppText';
import type { ChallengeWithStats } from '@/lib/types';

export type CarouselSocialProof = {
  name: string;
  avatarUrl?: string | null;
  kind: 'hosting' | 'joined';
};

export type CarouselProgress = {
  days: number;
  status: string;
  eliminated?: boolean;
};

type ChallengeCarouselProps = {
  title: string;
  challenges: ChallengeWithStats[];
  section?: InviteSection;
  currentUserId?: string;
  progressById?: Map<string, CarouselProgress>;
  socialProofById?: Map<string, CarouselSocialProof>;
  hostById?: Map<string, InviteHost>;
  selfHost?: InviteHost | null;
  onPress: (id: string) => void;
  allowCancel?: boolean;
  official?: boolean;
  showStateTags?: boolean;
  onOverflow?: (challenge: ChallengeWithStats, anchor: MenuAnchor) => void;
};

const CARD_GAP = 12;

export function ChallengeCarousel({
  title,
  challenges,
  section,
  currentUserId,
  progressById,
  socialProofById,
  hostById,
  selfHost,
  onPress,
  showStateTags = false,
}: ChallengeCarouselProps) {
  const { width } = useWindowDimensions();
  if (challenges.length === 0) {
    return null;
  }
  const cardWidth = Math.min(Math.round(width * 0.84), 420);

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
          const proof = socialProofById?.get(challenge.id);
          const resolvedHost = challenge.is_official
            ? null
            : hosting
              ? (selfHost ?? { name: 'You' })
              : (challenge.created_by && hostById?.get(challenge.created_by)) ||
                (proof?.kind === 'hosting' ? { name: proof.name, avatarUrl: proof.avatarUrl } : null);
          return (
            <View key={challenge.id} style={{ width: cardWidth, marginRight: CARD_GAP }}>
              <ChallengeInviteCard
                challenge={challenge}
                theme={challenge.is_official ? 'official' : 'user'}
                context="lobby"
                section={section}
                joined={Boolean(mine)}
                hosting={hosting}
                eliminated={Boolean(mine?.eliminated)}
                host={resolvedHost}
                showStateTags={showStateTags}
                onPress={() => onPress(challenge.id)}
              />
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
