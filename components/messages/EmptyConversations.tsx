import { MascotState } from '@/components/mascot/MascotState';

type EmptyConversationsProps = {
  onFindFriends: () => void;
};

export function EmptyConversations({ onFindFriends }: EmptyConversationsProps) {
  return (
    <MascotState
      kind="empty"
      title="No chats yet"
      body="Message a friend. A hello is cheaper than a call-out — and faster."
      actionLabel="Find a friend"
      onAction={onFindFriends}
      compact
    />
  );
}
