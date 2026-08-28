import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ClipPlayer, type ClipPlayItem } from '@/components/clips/ClipPlayer';
import { WatchSurface } from '@/components/clips/WatchSurface';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { usePost } from '@/hooks/useFeed';
import { useReel, useReels, useStoryChallengePreviews } from '@/hooks/useSocial';
import { buildRoundStack } from '@/lib/clipRail';
import { copy } from '@/lib/copy';
import { personDisplayName } from '@/lib/social';
import { supabase } from '@/lib/supabase';
import { ROUND_RECORD_MAX_MS } from '@/lib/waveClips';
import { startFreshRoundCapture } from '@/lib/waveCapture';
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
  const railQuery = useReels(16);
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

  const clips: ClipPlayItem[] = useMemo(() => {
    if (!reel) {
      return [];
    }
    const stacked = buildRoundStack(railQuery.data ?? [], reel.id);
    const rows = stacked.length > 0 ? stacked : [reel];
    return rows.map((item) => ({
      id: item.id,
      kind: 'round' as const,
      mediaUrl: item.video_url,
      mediaType: 'video' as const,
      caption: item.caption,
      durationMs: item.duration_ms || ROUND_RECORD_MAX_MS,
      authorId: item.user_id,
      authorName: personDisplayName(item.profile) || 'Blob',
      authorAvatar: item.profile?.avatar_url ?? null,
      username: item.profile?.username ?? null,
      createdAt: item.created_at,
      postId: item.post_id,
      challengeId: item.challenge_id,
      isOwn: item.user_id === user?.id,
      audience: item.id === reel.id ? postQuery.data?.audience : undefined,
      audienceUserIds: item.id === reel.id ? postQuery.data?.audience_user_ids : undefined,
      coverUrl: item.thumbnail_url ?? item.video_url,
      privacyMode: item.id === reel.id ? privacyQuery.data : undefined,
    }));
  }, [postQuery.data, privacyQuery.data, railQuery.data, reel, user?.id]);
  const challenges = useMemo(
    () => new Map((challengeQuery.data ?? []).map((challenge) => [challenge.id, challenge])),
    [challengeQuery.data],
  );

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

  return (
    <ClipPlayer
      key={reel.id}
      clips={clips}
      startIndex={0}
      autoAdvance={false}
      openComments={comments === '1' || (Array.isArray(comments) && comments[0] === '1')}
      challenges={challenges}
      sharePrompt={promptShare}
      onClose={close}
      onCreate={() => {
        close();
        startFreshRoundCapture(router);
      }}
    />
  );
}
