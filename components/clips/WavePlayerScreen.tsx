import { useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClipPlayer, type ClipPlayItem } from '@/components/clips/ClipPlayer';
import { WatchSurface } from '@/components/clips/WatchSurface';
import { BlobMascot } from '@/components/mascot/BlobMascot';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { useStory, useStoryChallengePreviews, useStoryGroups } from '@/hooks/useSocial';
import { flattenWaveStories } from '@/lib/clipRail';
import { waveWatchName } from '@/lib/clipWatch';
import { copy } from '@/lib/copy';
import { startFreshWaveCapture } from '@/lib/waveCapture';
import { WAVE_CLIP_MS } from '@/lib/waveClips';
import { type FeedChallengePreview } from '@/lib/social';
import { THEME } from '@/lib/theme';
import { TABS_HREF } from '@/lib/routes';

export function WavePlayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id, comments, from } = useLocalSearchParams<{ id: string; comments?: string; from?: string }>();
  const storyId = Array.isArray(id) ? id[0] : id;
  const fromSurface = Array.isArray(from) ? from[0] : from;
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const { groups, viewedIds, isLoading } = useStoryGroups();
  const storyQuery = useStory(storyId);
  const challengeIds = useMemo(() => {
    const ids = groups.flatMap((group) =>
      group.stories.map((story) => story.challenge_id).filter((value): value is string => Boolean(value)),
    );
    if (storyQuery.data?.challenge_id) {
      ids.push(storyQuery.data.challenge_id);
    }
    return ids;
  }, [groups, storyQuery.data?.challenge_id]);
  const challengeQuery = useStoryChallengePreviews(challengeIds);
  const challenges = useMemo(() => {
    const map = new Map<string, FeedChallengePreview>();
    for (const challenge of challengeQuery.data ?? []) {
      map.set(challenge.id, challenge);
    }
    return map;
  }, [challengeQuery.data]);

  const { clips, startIndex } = useMemo(() => {
    if (!storyId) {
      return { clips: [] as ClipPlayItem[], startIndex: 0 };
    }
    const flat = flattenWaveStories({ groups, startStoryId: storyId, extra: storyQuery.data });
    return {
      startIndex: flat.startIndex,
      clips: flat.stories.map((story) => {
      const group = groups.find((row) => row.userId === story.user_id);
      const name = waveWatchName({
        isOwn: story.user_id === user?.id,
        groupName: group?.name,
        displayName: story.user_id === profile?.id ? profile?.display_name : null,
        username: story.user_id === profile?.id ? profile?.username : null,
      });
      const item: ClipPlayItem = {
        id: story.id,
        kind: 'wave',
        mediaUrl: story.media_url,
        mediaType: story.media_type,
        caption: story.caption,
        durationMs:
          story.media_type === 'video'
            ? Math.max(story.clip_duration_ms || WAVE_CLIP_MS, 400)
            : WAVE_CLIP_MS,
        startMs: story.clip_start_ms ?? 0,
        authorId: story.user_id,
        authorName: name,
        authorAvatar: group?.avatar ?? (story.user_id === profile?.id ? profile?.avatar_url : null),
        createdAt: story.created_at,
        postId: story.post_id,
        challengeId: story.challenge_id,
        isOwn: story.user_id === user?.id,
      };
      return item;
    }),
    };
  }, [groups, profile, storyId, storyQuery.data, user?.id]);

  function close() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    if (fromSurface === 'profile') {
      router.replace('/profile');
      return;
    }
    router.replace(TABS_HREF);
  }

  if (isLoading || (storyQuery.isLoading && clips.length === 0)) {
    return (
      <WatchSurface>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={THEME.accentBright} />
        </View>
      </WatchSurface>
    );
  }

  if (!storyId) {
    return (
      <WatchSurface>
        <View className="flex-1 items-center justify-center px-8" style={{ paddingTop: insets.top }}>
          <BlobMascot size={180} variant="wave" motion="float" />
          <AppText className="mt-4 text-center text-[16px] font-bold" style={{ color: '#fff' }}>
            {copy('wave.empty')}
          </AppText>
          <Pressable
            accessibilityRole="button"
            onPress={() => startFreshWaveCapture(router)}
            className="mt-6 rounded-full px-5 py-3"
            style={{ backgroundColor: THEME.primary, minHeight: 44, justifyContent: 'center' }}>
            <AppText className="text-[15px] font-bold" style={{ color: '#fff' }}>
              {copy('wave.noun')}
            </AppText>
          </Pressable>
        </View>
      </WatchSurface>
    );
  }

  if (clips.length === 0) {
    return (
      <WatchSurface>
        <View className="flex-1 items-center justify-center px-8" style={{ paddingTop: insets.top }}>
          <AppText className="text-center text-[16px] font-bold" style={{ color: '#fff' }}>
            {copy('wave.gone')}
          </AppText>
          <Pressable
            onPress={close}
            className="mt-6 rounded-full px-4 py-2"
            style={{ backgroundColor: THEME.accent, minHeight: 44, justifyContent: 'center' }}>
            <AppText className="text-[14px] font-bold" style={{ color: '#fff' }}>
              Back
            </AppText>
          </Pressable>
        </View>
      </WatchSurface>
    );
  }

  return (
    <ClipPlayer
      key={storyId}
      clips={clips}
      startIndex={startIndex}
      autoAdvance
      openComments={comments === '1' || (Array.isArray(comments) && comments[0] === '1')}
      challenges={challenges}
      viewedIds={viewedIds}
      onClose={close}
    />
  );
}
