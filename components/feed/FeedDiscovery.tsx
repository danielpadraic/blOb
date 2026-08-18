import { View } from 'react-native';

import { ChallengeRail } from '@/components/feed/ChallengeRail';
import { StoryTray } from '@/components/feed/StoryTray';

export function FeedStories() {
  return (
    <View className="gap-3">
      <StoryTray />
    </View>
  );
}

export function FeedRails() {
  return <ChallengeRail />;
}
