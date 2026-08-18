import { MascotState } from '@/components/mascot/MascotState';
import { useCopyTone } from '@/hooks/useCopy';
import { copy } from '@/lib/copy';

type EmptyConversationsProps = {
  onFindFriends: () => void;
};

export function EmptyConversations({ onFindFriends }: EmptyConversationsProps) {
  const tone = useCopyTone();
  return (
    <MascotState
      kind="empty"
      title={copy('messages.empty', tone)}
      actionLabel="Find a friend"
      onAction={onFindFriends}
      compact
    />
  );
}
