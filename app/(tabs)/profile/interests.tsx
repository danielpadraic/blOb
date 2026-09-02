import { useLocalSearchParams } from 'expo-router';

import { InterestsWizard } from '@/components/interests/InterestsWizard';
import { Screen } from '@/components/ui/Screen';
import { TAB_ROOT_EDGES } from '@/components/wallet/TabChrome';
import { useCopyTone } from '@/hooks/useCopy';

export default function InterestsScreen() {
  const params = useLocalSearchParams<{ from?: string }>();
  const from = Array.isArray(params.from) ? params.from[0] : params.from;
  const tone = useCopyTone();
  return (
    <Screen padded={false} edges={TAB_ROOT_EDGES} keyboardAvoiding={false}>
      <InterestsWizard fromHome={from === 'home'} tone={tone} />
    </Screen>
  );
}
