import { ChallengeShareEmbed } from '@/components/feed/ChallengeShareEmbed';
import type { FeedChallengePreview } from '@/lib/social';

type ChallengeFeedCardProps = {
  challenge: FeedChallengePreview;
  joined?: boolean;
  won?: boolean;
  onPress?: () => void;
};

/** Home/composer share attachment. Visual is ChallengeShareEmbed. */
export function ChallengeFeedCard({ challenge, joined, onPress }: ChallengeFeedCardProps) {
  return <ChallengeShareEmbed challenge={challenge} joined={joined} onPress={onPress} />;
}
