import { useQuery } from '@tanstack/react-query';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClipPlayer, type ClipPlayItem } from '@/components/clips/ClipPlayer';
import { WatchSurface } from '@/components/clips/WatchSurface';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { usePost } from '@/hooks/useFeed';
import { useReel, useStoryChallengePreviews } from '@/hooks/useSocial';
import { copy } from '@/lib/copy';
import { personDisplayName } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import { ROUND_RECORD_MAX_MS } from '@/lib/waveClips';
import { THEME } from '@/lib/theme';
import { TABS_HREF } from '@/lib/routes';

export function RoundPlayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id, comments, from, sharePrompt } = useLocalSearchParams<{
    id: string;
    comments?: string;
    from?: string;
    sharePrompt?: string;
  }>();
  const reelId = Array.isArray(id) ? id[0] : id;
  const fromSurface = Array.isArray(from) ? from[0] : from;
  const promptShare =
    sharePrompt === '1' || (Array.isArray(sharePrompt) && sharePrompt[0] === '1');
  const reelQuery = useReel(reelId);
  const reel = reelQuery.data;
  const postQuery = usePost(reel?.post_id);
  const challengeIds = reel?.challenge_id ? [reel.challenge_id] : [];
  const challengeQuery = useStoryChallengePreviews(challengeIds);
  const privacyQuery = useQuery({
    queryKey: ['challenge-privacy', reel?.challenge_id],
    enabled: Boolean(reel?.challenge_id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('challenges')
        .select('privacy_mode')
        .eq('id', reel!.challenge_id as string)
        .maybeSingle();
      if (error) {
        return null;
      }
      return (data as { privacy_mode?: string | null } | null)?.privacy_mode ?? null;
    },
  });

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

  if (reelQuery.isLoading) {
    return (
      <WatchSurface>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={THEME.accentBright} />
        </View>
      </WatchSurface>
    );
  }

  if (!reel) {
    return (
      <WatchSurface>
        <View className="flex-1 items-center justify-center px-8" style={{ paddingTop: insets.top }}>
          <AppText className="text-center text-[16px] font-bold" style={{ color: '#fff' }}>
            {copy('round.gone')}
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

  const clip: ClipPlayItem = {
    id: reel.id,
    kind: 'round',
    mediaUrl: reel.video_url,
    mediaType: 'video',
    caption: reel.caption,
    durationMs: reel.duration_ms || ROUND_RECORD_MAX_MS,
    authorId: reel.user_id,
    authorName: personDisplayName(reel.profile) || 'Blob',
    authorAvatar: reel.profile?.avatar_url ?? null,
    username: reel.profile?.username ?? null,
    createdAt: reel.created_at,
    postId: reel.post_id,
    challengeId: reel.challenge_id,
    isOwn: reel.user_id === user?.id,
    audience: postQuery.data?.audience,
    audienceUserIds: postQuery.data?.audience_user_ids,
    coverUrl: reel.thumbnail_url ?? postQuery.data?.media_urls?.[0] ?? reel.video_url,
    privacyMode: privacyQuery.data,
  };
  const challenges = new Map(
    (challengeQuery.data ?? []).map((challenge) => [challenge.id, challenge]),
  );

  return (
    <ClipPlayer
      key={reel.id}
      clips={[clip]}
      startIndex={0}
      autoAdvance={false}
      openComments={comments === '1' || (Array.isArray(comments) && comments[0] === '1')}
      challenges={challenges}
      sharePrompt={promptShare}
      onClose={close}
    />
  );
}
