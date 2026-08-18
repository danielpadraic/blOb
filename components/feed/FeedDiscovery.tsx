import { View } from 'react-native';

import { ChallengeRail } from '@/components/feed/ChallengeRail';
import { ReelsRow } from '@/components/feed/ReelsRow';
import { StoriesRow } from '@/components/feed/StoriesRow';

export function FeedStories() {
  return (
    <View className="gap-3">
      <StoriesRow />
      <ReelsRow />
    </View>
  );
}

export function FeedRails() {
  return <ChallengeRail />;
}
