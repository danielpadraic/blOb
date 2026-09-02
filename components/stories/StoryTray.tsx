import { useEffect } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useRouter } from 'expo-router';

import { StoryRing } from '@/components/stories/StoryRing';
import { TourAnchor } from '@/components/tour/TourAnchor';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useStoryGroups } from '@/hooks/useSocial';
import { useVideoPoster } from '@/hooks/useVideoPoster';
import { copy } from '@/lib/copy';
import { clipRouteId, waveHref } from '@/lib/routes';
import { persistStoryThumbnail, type StoryGroup } from '@/lib/social';
import { persistGeneratedPoster } from '@/lib/videoPoster';
import { previewFromStory } from '@/lib/wavePreview';
import { startFreshWaveCapture } from '@/lib/waveCapture';
import { THEME } from '@/lib/theme';

export function StoryTray() {
  const router = useRouter();
  const { user } = useAuth();
  const { groups, viewedIds } = useStoryGroups({ includeEmptyOwn: true });
  const othersVisible = groups.some((group) => !group.isOwn && group.stories.length > 0);

  if (!user?.id && !othersVisible) {
    return null;
  }

  function openGroup(group: StoryGroup) {
    const latest = [...group.stories].sort(
      (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
    )[0];
    if (!latest || !clipRouteId(latest.id)) {
      if (!latest) {
        startFreshWaveCapture(router);
      }
      return;
    }
    router.push(waveHref(latest.id, { from: 'home' }));
  }

  return (
    <View style={{ marginHorizontal: -16 }}>
      <ScrollView
        horizontal
        nestedScrollEnabled
        directionalLockEnabled
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingHorizontal: 16, paddingVertical: 0 }}>
        {groups.map((group) => {
          const unseen = group.stories.some((story) => story?.id && !viewedIds.has(story.id));
          const bubble = (
            <StoryBubble
              group={group}
              seen={group.stories.length === 0 || (!group.isOwn && !unseen)}
              onPress={() => openGroup(group)}
              onAdd={() => startFreshWaveCapture(router)}
            />
          );
          if (group.isOwn) {
            return (
              <TourAnchor key={group.userId} id="tour-waves">
                {bubble}
              </TourAnchor>
            );
          }
          return <View key={group.userId}>{bubble}</View>;
        })}
      </ScrollView>
    </View>
  );
}

function WaveRing({ group, seen }: { group: StoryGroup; seen: boolean }) {
  const { user } = useAuth();
  const latest = [...group.stories].sort(
    (a, b) => Date.parse(b.created_at) - Date.parse(a.created_at),
  )[0];
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
    <View className="items-center">
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
    </View>
  );
}
