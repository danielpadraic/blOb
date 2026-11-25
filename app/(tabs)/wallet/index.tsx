import { WalletHome } from '@/components/wallet/WalletHome';
import { Screen } from '@/components/ui/Screen';
import { tabBarLift } from '@/lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function WalletScreen() {
  const insets = useSafeAreaInsets();
  return (
    <Screen scroll contentPaddingBottom={tabBarLift(insets.bottom) + 24}>
      <WalletHome />
    </Screen>
  );
}
