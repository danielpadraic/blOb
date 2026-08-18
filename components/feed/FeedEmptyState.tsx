import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { MascotState } from '@/components/mascot/MascotState';
import { Button } from '@/components/ui/Button';

type FeedEmptyStateProps = {
  compact?: boolean;
};

export function FeedEmptyState({ compact }: FeedEmptyStateProps) {
  const router = useRouter();

  return (
    <View>
      <MascotState
        kind="empty"
        title="The arena is quiet"
        body="Join a challenge, find a friend, or host one — that’s how the feed fills up."
        compact={compact}
      />
      <View className="mt-1 gap-2 px-2">
        <Button title="Join a challenge" onPress={() => router.push('/challenges')} />
        <Button
          title="Find friends"
          variant="outline"
          onPress={() => router.push('/friends')}
        />
        <Button
          title="Create a challenge"
          variant="mint"
          onPress={() => router.push('/challenges/create')}
        />
      </View>
    </View>
  );
}
