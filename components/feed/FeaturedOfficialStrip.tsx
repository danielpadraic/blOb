import { View } from 'react-native';

import { ChallengeInviteCard } from '@/components/challenge/ChallengeInviteCard';
import { TourAnchor } from '@/components/tour/TourAnchor';
import { useAuth } from '@/hooks/useAuth';
import { useFeaturedOfficialChallenge, useMyChallengeProgress } from '@/hooks/useChallenge';
import { isOfficialJoinable } from '@/lib/officialSeries';

export function FeaturedOfficialStrip() {
  const { user } = useAuth();
  const featured = useFeaturedOfficialChallenge();
  const mine = useMyChallengeProgress();

  const challenge = featured.data ?? null;
  const joined = Boolean((mine.data ?? []).some((row) => row.challenge_id === challenge?.id));
  const joinable = Boolean(challenge && isOfficialJoinable(challenge) && !joined);

  if (!challenge || !joinable) {
    return null;
  }

  return (
    <TourAnchor id="tour-official">
      <View>
        <ChallengeInviteCard
          challenge={challenge}
          theme="official"
          context="feed"
          section="official"
          joined={Boolean(user && joined)}
        />
      </View>
    </TourAnchor>
  );
}
