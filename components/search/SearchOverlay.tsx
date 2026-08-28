import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';

import { DismissKeyboard } from '@/components/ui/DismissKeyboard';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { Avatar } from '@/components/ui/Avatar';
import { useAuth } from '@/hooks/useAuth';
import { openChallengeLobby } from '@/lib/challengeOpen';
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
    if (!id) {
      return;
    }
    onClose();
    openChallengeLobby(router, { id, returnTo: 'feed' });
  }

  return (
    <ChromeOverlay visible={visible} onClose={onClose} align="start" dim>
      <View
        style={{
          marginTop: 4,
          marginHorizontal: 12,
          maxHeight: 520,
          backgroundColor: THEME.surface,
          borderColor: THEME.border,
          borderWidth: 1,
          borderRadius: 16,
          overflow: 'hidden',
          ...themeShadow('card'),
        }}>
        <TextInput
          value={term}
          onChangeText={setTerm}
          placeholder="Search people, Challenges, #tags"
          placeholderTextColor={THEME.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          accessibilityLabel="Search"
          style={{
            height: 40,
            paddingHorizontal: 12,
            borderBottomWidth: 1,
            borderBottomColor: THEME.border,
            color: THEME.textPrimary,
            fontSize: 15,
          }}
        />
        <ScrollView
          className="max-h-[420px]"
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerClassName="px-3 pb-4 pt-2 gap-3">
          <DismissKeyboard>
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
          </DismissKeyboard>
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
