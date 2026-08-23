import { ChallengeInviteCard } from '@/components/challenge/ChallengeInviteCard';
import type { FeedChallengePreview } from '@/lib/social';

type ChallengeFeedCardProps = {
  challenge: FeedChallengePreview;
  joined?: boolean;
  won?: boolean;
  onPress?: () => void;
};

export function ChallengeFeedCard({ challenge, joined, onPress }: ChallengeFeedCardProps) {
  return (
    <ChallengeInviteCard
      challenge={challenge}
      theme={challenge.is_official ? 'official' : 'user'}
      context="feed"
      joined={joined}
      onPress={onPress}
    />
  );
}
