import { ActivityIndicator, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClipPlayer, type ClipPlayItem } from '@/components/clips/ClipPlayer';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useReel, useStoryChallengePreviews } from '@/hooks/useSocial';
import { copy } from '@/lib/copy';
import { personDisplayName } from '@/lib/social';
import { ROUND_RECORD_MAX_MS } from '@/lib/waveClips';
import { THEME } from '@/lib/theme';
import { TABS_HREF } from '@/lib/routes';

export function RoundPlayerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { id, comments, from } = useLocalSearchParams<{ id: string; comments?: string; from?: string }>();
  const reelId = Array.isArray(id) ? id[0] : id;
  const fromSurface = Array.isArray(from) ? from[0] : from;
  const reelQuery = useReel(reelId);
  const challengeIds = reelQuery.data?.challenge_id ? [reelQuery.data.challenge_id] : [];
  const challengeQuery = useStoryChallengePreviews(challengeIds);
  const reel = reelQuery.data;

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
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: '#101312' }}>
        <ActivityIndicator color={THEME.accentBright} />
      </View>
    );
  }

  if (!reel) {
    return (
      <View
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: '#101312', paddingTop: insets.top }}>
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
    createdAt: reel.created_at,
    postId: reel.post_id,
    challengeId: reel.challenge_id,
    isOwn: reel.user_id === user?.id,
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
      onClose={close}
    />
  );
}
