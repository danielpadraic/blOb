import { View } from 'react-native';

import { ProfileLink } from '@/components/profile/ProfileLink';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { personDisplayName, type FriendEdge } from '@/lib/social';
import { THEME } from '@/lib/theme';

type FriendRequestCardProps = {
  request: FriendEdge;
  direction: 'incoming' | 'outgoing';
  busy?: boolean;
  onAccept?: () => void;
  onDecline?: () => void;
  onCancel?: () => void;
};

export function FriendRequestCard({
  request,
  direction,
  busy,
  onAccept,
  onDecline,
  onCancel,
}: FriendRequestCardProps) {
  const profile = request.profile;
  const name = personDisplayName(profile);
  const incoming = direction === 'incoming';

  return (
    <Card
      style={
        incoming
          ? { borderColor: THEME.accent, backgroundColor: THEME.surface }
          : undefined
      }>
      <View className="flex-row items-center">
        <ProfileLink username={profile?.username} userId={profile?.id}>
          <Avatar uri={profile?.avatar_url} name={name} size={44} />
        </ProfileLink>
        <View className="ml-3 min-w-0 flex-1">
          <AppText className="text-[15px] font-bold text-charcoal" numberOfLines={1}>
            {name}
          </AppText>
          <AppText className="text-[12px] text-muted" numberOfLines={1}>
            {incoming
              ? 'Wants to be friends — compete together'
              : 'Waiting on them to accept'}
          </AppText>
        </View>
        <View
          className="ml-2 rounded-full px-2 py-1"
          style={{ backgroundColor: incoming ? THEME.accentSoft : THEME.surface2 }}>
          <AppText
            className="text-[10px] font-bold"
            style={{ color: incoming ? THEME.accent : THEME.textMuted }}>
            {incoming ? 'Incoming' : 'Sent'}
          </AppText>
        </View>
      </View>
      {incoming ? (
        <View className="mt-3 flex-row gap-2">
          <Button
            title="Decline"
            size="sm"
            variant="outline"
            className="flex-1"
            disabled={busy}
            onPress={onDecline}
          />
          <Button
            title="Accept"
            size="sm"
            variant="primary"
            className="flex-1"
            loading={busy}
            onPress={onAccept}
          />
        </View>
      ) : (
        <View className="mt-3">
          <Button
            title="Cancel request"
            size="sm"
            variant="ghost"
            loading={busy}
            onPress={onCancel}
          />
        </View>
      )}
    </Card>
  );
}
