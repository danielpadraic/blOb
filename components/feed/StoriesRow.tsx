import { Alert, Pressable, ScrollView, View } from 'react-native';

import { Avatar } from '@/components/ui/Avatar';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';
import { useCoinRecipientSuggestions } from '@/hooks/useCoins';
import { useMyProfile } from '@/hooks/useProfile';

type StoryItem = {
  id: string;
  name: string;
  avatar?: string | null;
  isOwn?: boolean;
  unseen?: boolean;
};

const PLACEHOLDER_STORIES: StoryItem[] = [
  { id: 'maya', name: 'Maya', unseen: true },
  { id: 'jax', name: 'Jax', unseen: true },
  { id: 'rio', name: 'Rio', unseen: true },
  { id: 'len', name: 'Len', unseen: true },
  { id: 'nova', name: 'Nova', unseen: true },
];

export function StoriesRow() {
  const { profile } = useMyProfile();
  const suggestions = useCoinRecipientSuggestions();
  const following = suggestions.data?.following ?? [];

  const mine: StoryItem = {
    id: 'me',
    name: 'Your story',
    isOwn: true,
    avatar: profile?.avatar_url,
  };

  const people: StoryItem[] =
    following.length > 0
      ? following.slice(0, 6).map((person) => ({
          id: person.id,
          name: person.display_name ?? person.username,
          avatar: person.avatar_url,
          unseen: true,
        }))
      : PLACEHOLDER_STORIES;

  function onPress() {
    Alert.alert('Stories coming soon', 'Tap again later — this row is just a preview.');
  }

  return (
    <View style={{ marginHorizontal: -16 }}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 13, paddingHorizontal: 16, paddingVertical: 2 }}>
        <StoryBubble item={mine} onPress={onPress} />
        {people.map((item) => (
          <StoryBubble key={item.id} item={item} onPress={onPress} />
        ))}
      </ScrollView>
    </View>
  );
}

function StoryBubble({
  item,
  onPress,
}: {
  item: StoryItem;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={item.name}
      className="w-[54px] items-center">
      <View
        className="relative items-center justify-center rounded-full"
        style={{
          width: 54,
          height: 54,
          borderWidth: item.isOwn ? 0 : 2,
          borderColor: item.unseen ? THEME.accent : THEME.border,
          padding: item.isOwn ? 0 : 2,
          backgroundColor: item.isOwn ? undefined : THEME.background,
        }}>
        {item.isOwn ? (
          <View
            className="items-center justify-center overflow-hidden"
            style={{
              width: 50,
              height: 50,
              borderRadius: 25,
              backgroundColor: THEME.accent,
            }}>
            {item.avatar ? (
              <Avatar uri={item.avatar} name={item.name} size={50} />
            ) : (
              <AppText className="text-[15px] font-extrabold" style={{ color: '#fff' }}>
                YS
              </AppText>
            )}
          </View>
        ) : (
          <Avatar uri={item.avatar} name={item.name} size={46} />
        )}
        {item.isOwn ? (
          <View
            className="absolute items-center justify-center"
            style={{
              right: -2,
              bottom: -3,
              width: 17,
              height: 17,
              borderRadius: 9,
              backgroundColor: THEME.accent,
              borderWidth: 2,
              borderColor: THEME.background,
            }}>
            <Glyph name={GLYPH.plus} color={THEME.primaryForeground} size={10} />
          </View>
        ) : null}
      </View>
      <AppText className="mt-1.5 text-center text-[10px] text-muted" numberOfLines={1}>
        {item.isOwn ? 'Your story' : item.name}
      </AppText>
    </Pressable>
  );
}
