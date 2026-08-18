import { useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StoryViewer } from '@/components/stories/StoryViewer';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { useStory, useStoryChallengePreviews, useStoryGroups } from '@/hooks/useSocial';
import { personDisplayName, type FeedChallengePreview, type StoryGroup } from '@/lib/social';
import { THEME } from '@/lib/theme';

export default function StoryViewerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useAuth();
  const { profile } = useMyProfile();
  const { groups, isLoading } = useStoryGroups();
  const storyQuery = useStory(id);
  const challengeIds = useMemo(() => {
    const fromGroups = groups.flatMap((group) =>
      group.stories.map((story) => story.challenge_id).filter((value): value is string => Boolean(value)),
    );
    if (storyQuery.data?.challenge_id) {
      fromGroups.push(storyQuery.data.challenge_id);
    }
    return fromGroups;
  }, [groups, storyQuery.data?.challenge_id]);
  const challengeQuery = useStoryChallengePreviews(challengeIds);

  const challenges = useMemo(() => {
    const map = new Map<string, FeedChallengePreview>();
    for (const challenge of challengeQuery.data ?? []) {
      map.set(challenge.id, challenge);
    }
    return map;
  }, [challengeQuery.data]);

  const playback = useMemo(() => {
    const storyId = Array.isArray(id) ? id[0] : id;
    if (!storyId) {
      return null;
    }
    const playable = groups.filter((group) => group.stories.length > 0);
    for (let groupIndex = 0; groupIndex < playable.length; groupIndex += 1) {
      const group = playable[groupIndex]!;
      const storyIndex = group.stories.findIndex((story) => story.id === storyId);
      if (storyIndex >= 0) {
        return { groups: playable, groupIndex, storyIndex };
      }
    }
    const fallback = storyQuery.data;
    if (!fallback) {
      return null;
    }
    const solo: StoryGroup = {
      userId: fallback.user_id,
      name:
        fallback.user_id === user?.id
          ? 'Your story'
          : personDisplayName(fallback.user_id === profile?.id ? profile : null) || 'Blob',
      avatar: fallback.user_id === profile?.id ? profile.avatar_url : null,
      isOwn: fallback.user_id === user?.id,
      stories: [fallback],
    };
    return { groups: [solo], groupIndex: 0, storyIndex: 0 };
  }, [groups, id, profile, storyQuery.data, user?.id]);

  function close() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/feed');
  }

  if ((isLoading || storyQuery.isLoading) && !playback) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: '#101312' }}>
        <ActivityIndicator color={THEME.accentBright} />
      </View>
    );
  }

  if (!playback) {
    return (
      <View
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: '#101312', paddingTop: insets.top }}>
        <AppText className="text-center text-[16px] font-bold" style={{ color: '#fff' }}>
          This story is gone
        </AppText>
        <AppText className="mt-2 text-center text-[14px]" style={{ color: 'rgba(255,255,255,0.7)' }}>
          It may have expired, or the link is no longer valid.
        </AppText>
        <Pressable onPress={close} className="mt-6 rounded-full px-4 py-2" style={{ backgroundColor: THEME.accent }}>
          <AppText className="text-[14px] font-bold" style={{ color: '#fff' }}>
            Back to feed
          </AppText>
        </Pressable>
      </View>
    );
  }

  return (
    <StoryViewer
      key={`${Array.isArray(id) ? id[0] : id}-${playback.groupIndex}-${playback.storyIndex}`}
      groups={playback.groups}
      startGroupIndex={playback.groupIndex}
      startStoryIndex={playback.storyIndex}
      challenges={challenges}
      onClose={close}
    />
  );
}
