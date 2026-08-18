import { useLocalSearchParams } from 'expo-router';

import { CaptureStudio } from '@/components/capture/CaptureStudio';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import type { CaptureMode } from '@/components/capture/types';

export default function CaptureScreen() {
  const params = useLocalSearchParams<{ mode?: string; media?: string }>();
  const rawMode = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const rawMedia = Array.isArray(params.media) ? params.media[0] : params.media;
  const initialMode: CaptureMode =
    rawMode === 'reel' || rawMode === 'post' ? rawMode : 'story';
  const initialMedia = rawMedia === 'video' || rawMedia === 'photo' ? rawMedia : undefined;

  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES}>
      <CaptureStudio initialMode={initialMode} initialMedia={initialMedia} />
    </Screen>
  );
}
