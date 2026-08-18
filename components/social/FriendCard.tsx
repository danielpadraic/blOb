import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { ProfileLink } from '@/components/profile/ProfileLink';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { personDisplayName, type FriendEdge } from '@/lib/social';
import { THEME } from '@/lib/theme';

type FriendCardProps = {
  friend: FriendEdge;
  messaging?: boolean;
  onMessage: () => void;
};

export function FriendCard({ friend, messaging, onMessage }: FriendCardProps) {
  const router = useRouter();
  const profile = friend.profile;
  const name = personDisplayName(profile);
  const tags = profile?.skill_tags?.slice(0, 2) ?? [];
  const handle = profile?.username ?? profile?.id;

  return (
    <Card>
      <View className="flex-row items-start">
        <ProfileLink username={profile?.username} userId={profile?.id}>
          <Avatar uri={profile?.avatar_url} name={name} size={48} />
        </ProfileLink>
        <View className="ml-3 min-w-0 flex-1">
          <ProfileLink username={profile?.username} userId={profile?.id}>
            <AppText className="text-[16px] font-bold text-charcoal" numberOfLines={1}>
              {name}
            </AppText>
          </ProfileLink>
          {profile?.username ? (
            <AppText className="text-[13px] text-muted" numberOfLines={1}>
              @{profile.username}
            </AppText>
          ) : null}
          {tags.length > 0 ? (
            <AppText className="mt-1 text-[12px] text-muted" numberOfLines={1}>
              {tags.join(' · ')}
            </AppText>
          ) : profile?.bio ? (
            <AppText className="mt-1 text-[12px] text-muted" numberOfLines={2}>
              {profile.bio}
            </AppText>
          ) : (
            <AppText className="mt-1 text-[12px]" style={{ color: THEME.accent }}>
              Ready to compete
            </AppText>
          )}
        </View>
      </View>
      <View className="mt-3 flex-row gap-2">
        <Button
          title="Message"
          size="sm"
          variant="outline"
          className="flex-1"
          loading={messaging}
          onPress={onMessage}
        />
        <Button
          title="View profile"
          size="sm"
          variant="mint"
          className="flex-1"
          disabled={!handle}
          onPress={() =>
            handle
              ? router.push({ pathname: '/friends/u/[username]', params: { username: handle } })
              : undefined
          }
        />
      </View>
    </Card>
  );
}
