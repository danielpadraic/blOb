import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/hooks/useAuth';
import { challengeDetailHref } from '@/lib/routes';
import { isSearchEmpty, searchGlobal } from '@/lib/search';
import { personDisplayName } from '@/lib/social';
import { THEME, themeShadow } from '@/lib/theme';

type SearchOverlayProps = {
  visible: boolean;
  onClose: () => void;
};

export function SearchOverlay({ visible, onClose }: SearchOverlayProps) {
  const { user } = useAuth();
  const router = useRouter();
  const [term, setTerm] = useState('');

  useEffect(() => {
    if (!visible) {
      setTerm('');
    }
  }, [visible]);

  const query = useQuery({
    queryKey: ['global-search', user?.id, term.trim()],
    enabled: Boolean(visible && user?.id && term.trim().length >= 2),
    queryFn: () => searchGlobal(term, user!.id),
  });

  const results = query.data;
  const showEmpty =
    term.trim().length >= 2 && !query.isFetching && results != null && isSearchEmpty(results);

  function goProfile(username: string) {
    onClose();
    router.push({ pathname: '/profile/u/[username]', params: { username } });
  }

  function goChallenge(id: string) {
    onClose();
    router.push(challengeDetailHref(id, 'feed'));
  }

  return (
    <ChromeOverlay visible={visible} onClose={onClose} align="start" dim>
      <View
        style={{
          marginTop: 8,
          marginHorizontal: 12,
          maxHeight: 520,
          backgroundColor: THEME.surface,
          borderColor: THEME.border,
          borderWidth: 1,
          borderRadius: 22,
          overflow: 'hidden',
          ...themeShadow('card'),
        }}>
        <View className="px-3 pt-3">
          <Input
            value={term}
            onChangeText={setTerm}
            placeholder="Search people, Challenges, #tags"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
          />
        </View>
        <ScrollView
          className="max-h-[420px]"
          keyboardShouldPersistTaps="handled"
          contentContainerClassName="px-3 pb-4 pt-2 gap-3">
          {query.isFetching ? (
            <View className="items-center py-6">
              <ActivityIndicator color={THEME.accent} />
            </View>
          ) : null}
          {showEmpty ? (
            <AppText className="py-4 text-center text-[14px] text-muted">No matches.</AppText>
          ) : null}
          {results?.people.length ? (
            <Section title="People">
              {results.people.map((profile) => (
                <Pressable
                  key={profile.id}
                  accessibilityRole="button"
                  onPress={() => goProfile(profile.username)}
                  className="flex-row items-center py-2">
                  <Avatar uri={profile.avatar_url} name={personDisplayName(profile)} size={36} />
                  <View className="ml-2 min-w-0">
                    <AppText className="text-[14px] font-semibold text-charcoal" numberOfLines={1}>
                      {personDisplayName(profile)}
                    </AppText>
                    <AppText className="text-[12px] text-muted">@{profile.username}</AppText>
                  </View>
                </Pressable>
              ))}
            </Section>
          ) : null}
          {results?.challenges.length ? (
            <Section title="Challenges">
              {results.challenges.map((challenge) => (
                <Pressable
                  key={challenge.id}
                  accessibilityRole="button"
                  onPress={() => goChallenge(challenge.id)}
                  className="py-2">
                  <AppText className="text-[14px] font-semibold text-charcoal" numberOfLines={1}>
                    {challenge.title}
                  </AppText>
                </Pressable>
              ))}
            </Section>
          ) : null}
          {results?.hashtags.length ? (
            <Section title="Hashtags">
              {results.hashtags.map((item) => (
                <Pressable
                  key={item.tag}
                  accessibilityRole="button"
                  onPress={() => setTerm(`#${item.tag}`)}
                  className="py-2">
                  <AppText className="text-[14px] font-semibold text-charcoal">#{item.tag}</AppText>
                </Pressable>
              ))}
            </Section>
          ) : null}
          {results?.posts.length ? (
            <Section title="Posts">
              {results.posts.map((post) => (
                <View key={post.id} className="py-2">
                  <AppText className="text-[13px] leading-5 text-charcoal" numberOfLines={3}>
                    {post.content?.trim() || 'Photo post'}
                  </AppText>
                </View>
              ))}
            </Section>
          ) : null}
        </ScrollView>
      </View>
    </ChromeOverlay>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View>
      <AppText className="text-[11px] font-semibold uppercase tracking-wide text-muted">
        {title}
      </AppText>
      {children}
    </View>
  );
}
