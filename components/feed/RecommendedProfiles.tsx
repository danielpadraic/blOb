import { View } from 'react-native';

import { ProfileLink } from '@/components/profile/ProfileLink';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { useRecommendedProfiles } from '@/hooks/usePublicProfile';
import { personDisplayName } from '@/lib/social';
import { THEME } from '@/lib/theme';

export function RecommendedProfiles() {
  const query = useRecommendedProfiles();
  const people = query.data ?? [];
  if (people.length === 0) {
    return null;
  }

  return (
    <View
      className="px-3 py-3"
      style={{
        backgroundColor: THEME.surface,
        borderRadius: THEME.radius,
        borderWidth: 1,
        borderColor: THEME.border,
      }}>
      <AppText className="mb-2 text-[13px] font-semibold text-charcoal">Recommended</AppText>
      <View className="flex-row justify-between">
        {people.map((profile) => (
          <ProfileLink key={profile.id} username={profile.username} userId={profile.id}>
            <View className="w-[72px] items-center gap-1">
              <Avatar uri={profile.avatar_url} name={personDisplayName(profile)} size={48} />
              <AppText className="text-center text-[11px] font-semibold text-charcoal" numberOfLines={1}>
                {personDisplayName(profile)}
              </AppText>
            </View>
          </ProfileLink>
        ))}
      </View>
    </View>
  );
}
