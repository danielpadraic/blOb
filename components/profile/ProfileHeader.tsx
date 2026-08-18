import { View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { AppText } from '@/components/ui/AppText';
import type { Profile } from '@/lib/types';

type ProfileHeaderProps = {
  profile: Profile;
};

export function ProfileHeader({ profile }: ProfileHeaderProps) {
  const name = profile.display_name ?? profile.username;

  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-4">
        <Avatar uri={profile.avatar_url} name={name} size={84} />
        <View className="flex-1 gap-0.5">
          <AppText className="text-[22px] font-extrabold leading-7 text-charcoal" numberOfLines={1}>
            {name}
          </AppText>
          <AppText className="text-sm text-muted">@{profile.username}</AppText>
        </View>
      </View>
      {profile.bio ? (
        <AppText className="text-[15px] leading-5 text-ink">{profile.bio}</AppText>
      ) : null}
      {profile.skill_tags.length > 0 ? (
        <View className="flex-row flex-wrap gap-1.5">
          {profile.skill_tags.map((tag) => (
            <Badge key={tag} label={tag} />
          ))}
        </View>
      ) : null}
    </View>
  );
}
