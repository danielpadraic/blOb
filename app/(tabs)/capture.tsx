import { useLocalSearchParams } from 'expo-router';

import { CaptureStudio } from '@/components/capture/CaptureStudio';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import type { CaptureMode } from '@/components/capture/types';

export default function CaptureScreen() {
  const params = useLocalSearchParams<{ mode?: string }>();
  const raw = Array.isArray(params.mode) ? params.mode[0] : params.mode;
  const initialMode: CaptureMode | 'choose' =
    raw === 'story' || raw === 'reel' || raw === 'post' ? raw : 'choose';

  return (
    <Screen padded edges={TAB_ROOT_EDGES} className="px-4 pt-2">
      <CaptureStudio initialMode={initialMode} />
    </Screen>
  );
}
