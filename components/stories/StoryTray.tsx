import { useEffect } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { StoryRing } from '@/components/stories/StoryRing';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useStoryGroups } from '@/hooks/useSocial';
import { useVideoPoster } from '@/hooks/useVideoPoster';
import { copy } from '@/lib/copy';
import { storyHref } from '@/lib/routes';
import { persistStoryThumbnail, type StoryGroup } from '@/lib/social';
import { persistGeneratedPoster } from '@/lib/videoPoster';
import { previewFromStory } from '@/lib/wavePreview';
import { startFreshWaveCapture } from '@/lib/waveCapture';
import { THEME } from '@/lib/theme';

export function StoryTray() {
  const router = useRouter();
  const { groups, viewedIds } = useStoryGroups();

  function openGroup(group: StoryGroup) {
    if (group.stories.length === 0) {
      startFreshWaveCapture(router);
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
              onAdd={() => startFreshWaveCapture(router)}
            />
          );
        })}
      </ScrollView>
      {groups.every((group) => group.stories.length === 0) ? (
        <AppText className="px-4 pt-1 text-[12px] text-muted">{copy('wave.hint')}</AppText>
      ) : null}
    </View>
  );
}

function WaveRing({ group, seen }: { group: StoryGroup; seen: boolean }) {
  const { user } = useAuth();
  const latest = group.stories[group.stories.length - 1];
  const stored = latest ? previewFromStory(latest) : null;
  const generated = useVideoPoster(
    latest?.media_type === 'video' ? latest.media_url : null,
    latest?.thumbnail_url,
  );
  const previewUri = stored || generated;

  useEffect(() => {
    if (!latest || latest.media_type !== 'video' || latest.thumbnail_url || !generated || !user?.id) {
      return;
    }
    if (!group.isOwn || latest.user_id !== user.id) {
      return;
    }
    void persistGeneratedPoster({
      id: latest.id,
      videoUrl: latest.media_url,
      localUri: generated,
      userId: user.id,
      kind: 'story',
    }).then((url) => {
      if (url) {
        void persistStoryThumbnail(latest.id, url);
      }
    });
  }, [generated, group.isOwn, latest, user?.id]);

  return (
    <StoryRing
      uri={group.avatar}
      previewUri={previewUri}
      name={group.name}
      size={54}
      seen={seen}
      showAdd={group.isOwn && group.stories.length === 0}
      showPlay={latest?.media_type === 'video' && Boolean(previewUri)}
    />
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
    <View className="w-[54px] items-center">
      <View className="relative">
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={group.name}
          style={{ minWidth: 44, minHeight: 44 }}>
          <WaveRing group={group} seen={seen} />
        </Pressable>
        {showAdd && group.stories.length > 0 ? (
          <Pressable
            onPress={onAdd}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={copy('wave.add')}
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
        {group.isOwn ? copy('wave.yours') : group.name}
      </AppText>
    </View>
  );
}
