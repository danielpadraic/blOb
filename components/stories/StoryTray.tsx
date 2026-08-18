import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { StoryRing } from '@/components/stories/StoryRing';
import { AppText } from '@/components/ui/AppText';
import { useStoryGroups } from '@/hooks/useSocial';
import { STORY_CREATE_HREF, storyHref } from '@/lib/routes';
import { THEME } from '@/lib/theme';
import type { StoryGroup } from '@/lib/social';

export function StoryTray() {
  const router = useRouter();
  const { groups, viewedIds } = useStoryGroups();

  function openGroup(group: StoryGroup) {
    if (group.stories.length === 0) {
      router.push(STORY_CREATE_HREF);
      return;
    }
    router.push(storyHref(group.stories[0]!.id));
  }

  return (
    <View style={{ marginHorizontal: -16 }}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 13, paddingHorizontal: 16, paddingVertical: 2 }}>
        {groups.map((group) => {
          const unseen = group.stories.some((story) => !viewedIds.has(story.id));
          return (
            <StoryBubble
              key={group.userId}
              group={group}
              seen={group.stories.length === 0 || (!group.isOwn && !unseen)}
              onPress={() => openGroup(group)}
              onAdd={() => router.push(STORY_CREATE_HREF)}
            />
          );
        })}
      </ScrollView>
      {groups.every((group) => group.stories.length === 0) ? (
        <AppText className="px-4 pt-1 text-[12px] text-muted">Share a 24-hour story. Tap Your story to start.</AppText>
      ) : null}
    </View>
  );
}

function StoryBubble({
  group,
  seen,
  onPress,
  onAdd,
}: {
  group: StoryGroup;
  seen: boolean;
  onPress: () => void;
  onAdd: () => void;
}) {
  const showAdd = group.isOwn;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={group.name}
      className="w-[54px] items-center">
      <View className="relative">
        <StoryRing
          uri={group.avatar}
          name={group.name}
          size={54}
          seen={seen}
          showAdd={showAdd && group.stories.length === 0}
        />
        {showAdd && group.stories.length > 0 ? (
          <Pressable
            onPress={onAdd}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Add to your story"
            className="absolute items-center justify-center"
            style={{
              right: -1,
              bottom: -1,
              width: 18,
              height: 18,
              borderRadius: 9,
              backgroundColor: THEME.accent,
              borderWidth: 2,
              borderColor: THEME.background,
            }}>
            <AppText className="text-[11px] font-bold" style={{ color: THEME.primaryForeground }}>
              +
            </AppText>
          </Pressable>
        ) : null}
      </View>
      <AppText className="mt-1.5 text-center text-[10px] text-muted" numberOfLines={1}>
        {group.isOwn ? 'Your story' : group.name}
      </AppText>
    </Pressable>
  );
}
