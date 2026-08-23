import { ScrollView, View } from 'react-native';

import { ProfileLink } from '@/components/profile/ProfileLink';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { useRecommendedProfiles } from '@/hooks/usePublicProfile';
import { copy } from '@/lib/copy';
import { personDisplayName } from '@/lib/social';
import { THEME } from '@/lib/theme';
import type { PublicProfile } from '@/lib/types';

const AVATAR = 60;
const ITEM = 84;

function nameLines(profile: PublicProfile): { first: string; last: string | null } {
  const display = profile.display_name?.trim() ?? '';
  if (display) {
    const [first, ...rest] = display.split(/\s+/).filter(Boolean);
    if (first && rest.length > 0) {
      return { first, last: rest.join(' ') };
    }
    return { first: display, last: null };
  }
  return { first: profile.username, last: null };
}

export function RecommendedProfiles() {
  const query = useRecommendedProfiles();
  const people = query.data ?? [];
  if (people.length === 0) {
    return null;
  }

  return (
    <View>
      <AppText className="text-[18px] font-extrabold text-charcoal">
        {copy('feed.peopleYouMayKnow')}
      </AppText>
      <View
        className="mt-2.5 py-3"
        style={{
          backgroundColor: THEME.surface,
          borderRadius: THEME.radius,
          borderWidth: 1,
          borderColor: THEME.border,
          overflow: 'hidden',
        }}>
        <ScrollView
          horizontal
          nestedScrollEnabled
          directionalLockEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingHorizontal: 12 }}>
          {people.map((profile) => {
            const { first, last } = nameLines(profile);
            return (
              <ProfileLink key={profile.id} username={profile.username} userId={profile.id}>
                <View style={{ width: ITEM, alignItems: 'center', gap: 6 }}>
                  <Avatar uri={profile.avatar_url} name={personDisplayName(profile)} size={AVATAR} />
                  <View style={{ width: '100%', minHeight: last ? 30 : 15 }}>
                    <AppText
                      className="text-center text-[12px] font-semibold text-charcoal"
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.8}>
                      {first}
                    </AppText>
                    {last ? (
                      <AppText
                        className="text-center text-[12px] font-semibold text-charcoal"
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}>
                        {last}
                      </AppText>
                    ) : null}
                  </View>
                </View>
              </ProfileLink>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}
