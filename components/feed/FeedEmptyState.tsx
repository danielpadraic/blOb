import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { MascotState } from '@/components/mascot/MascotState';
import { Button } from '@/components/ui/Button';
import { useCopyTone } from '@/hooks/useCopy';
import { copy } from '@/lib/copy';

type FeedEmptyStateProps = {
  compact?: boolean;
};

export function FeedEmptyState({ compact }: FeedEmptyStateProps) {
  const router = useRouter();
  const tone = useCopyTone();

  return (
    <View>
      <MascotState
        kind="empty"
        title={copy('home.empty', tone)}
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
