import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ProfileLink } from '@/components/profile/ProfileLink';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { useRecommendedProfiles } from '@/hooks/usePublicProfile';
import { useBlockedPeerIds } from '@/hooks/useSocial';
import { copy } from '@/lib/copy';
import { canStartDirectChat } from '@/lib/dmOpen';
import { directMessageHref } from '@/lib/routes';
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
  const router = useRouter();
  const query = useRecommendedProfiles();
  const blocked = useBlockedPeerIds();
  const people = query.data ?? [];
  const blockedIds = blocked.data ?? new Set<string>();
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
            const canMessage = canStartDirectChat({ blocked: blockedIds.has(profile.id) });
            return (
              <View key={profile.id} style={{ width: ITEM, alignItems: 'center', gap: 6 }}>
                <ProfileLink username={profile.username} userId={profile.id}>
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
                {canMessage ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Message ${personDisplayName(profile)}`}
                    hitSlop={8}
                    onPress={() => router.push(directMessageHref(profile.id))}>
                    <AppText className="text-center text-[11px] font-semibold" style={{ color: THEME.accent }}>
                      Message
                    </AppText>
                  </Pressable>
                ) : (
                  <AppText className="text-center text-[11px] font-semibold" style={{ color: THEME.muted }}>
                    {copy('messages.blockedState')}
                  </AppText>
                )}
              </View>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}
