import { View } from 'react-native';

import { MascotState } from '@/components/mascot/MascotState';
import { Button } from '@/components/ui/Button';
import { useCopyTone } from '@/hooks/useCopy';
import { copy } from '@/lib/copy';

type EmptyConversationsProps = {
  onFindFriends: () => void;
  onNewMessage?: () => void;
};

export function EmptyConversations({ onFindFriends, onNewMessage }: EmptyConversationsProps) {
  const tone = useCopyTone();
  return (
    <View className="flex-1">
      <MascotState
        kind="empty"
        title={copy('messages.empty', tone)}
        actionLabel="Find a friend"
        onAction={onFindFriends}
        compact
      />
      {onNewMessage ? (
        <View className="px-8">
          <Button title="New message" variant="outline" onPress={onNewMessage} />
        </View>
      ) : null}
    </View>
  );
}
