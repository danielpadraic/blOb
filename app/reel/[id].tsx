import { useVideoPlayer, VideoView } from 'expo-video';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui/AppText';
import { useReel } from '@/hooks/useSocial';
import { copy } from '@/lib/copy';
import { personDisplayName } from '@/lib/social';
import { THEME } from '@/lib/theme';

export default function ReelViewerScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const reelId = Array.isArray(id) ? id[0] : id;
  const reelQuery = useReel(reelId);

  function close() {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    router.replace('/feed');
  }

  if (reelQuery.isLoading) {
    return (
      <View className="flex-1 items-center justify-center" style={{ backgroundColor: '#101312' }}>
        <ActivityIndicator color={THEME.accentBright} />
      </View>
    );
  }

  const reel = reelQuery.data;
  if (!reel) {
    return (
      <View
        className="flex-1 items-center justify-center px-8"
        style={{ backgroundColor: '#101312', paddingTop: insets.top }}>
        <AppText className="text-center text-[16px] font-bold" style={{ color: '#fff' }}>
          {copy('round.gone')}
        </AppText>
        <AppText className="mt-2 text-center text-[14px]" style={{ color: 'rgba(255,255,255,0.7)' }}>
          {copy('round.goneBody')}
        </AppText>
        <Pressable onPress={close} className="mt-6 rounded-full px-4 py-2" style={{ backgroundColor: THEME.accent }}>
          <AppText className="text-[14px] font-bold" style={{ color: '#fff' }}>
            Back to feed
          </AppText>
        </Pressable>
      </View>
    );
  }

  const username = reel.profile?.username?.trim();
  const handle = username ? `@${username.replace(/^@/, '')}` : personDisplayName(reel.profile);
  const title = reel.caption?.trim() || copy('round.fallback');

  return (
    <View className="flex-1" style={{ backgroundColor: '#101312' }}>
      <ReelVideo uri={reel.video_url} />
      <View
        pointerEvents="box-none"
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          paddingTop: insets.top + 8,
          paddingBottom: insets.bottom + 16,
          paddingHorizontal: 16,
          justifyContent: 'space-between',
        }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close Round"
          onPress={close}
          hitSlop={8}
          style={{ alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' }}>
          <AppText className="text-[15px] font-semibold" style={{ color: '#fff' }}>
            Close
          </AppText>
        </Pressable>
        <View>
          <AppText className="text-[13px] font-bold" style={{ color: 'rgba(255,255,255,0.8)' }}>
            {handle}
          </AppText>
          <AppText className="mt-1 text-[18px] font-extrabold" style={{ color: '#fff' }}>
            {title}
          </AppText>
        </View>
      </View>
    </View>
  );
}

function ReelVideo({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.muted = false;
    instance.play();
  });
  return (
    <VideoView
      player={player}
      style={{ width: '100%', height: '100%', backgroundColor: '#101312' }}
      contentFit="contain"
      nativeControls={false}
    />
  );
}
