import { View } from 'react-native';

import { SendCoinsPanel } from '@/app/(tabs)/profile/send';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { useWallet } from '@/hooks/useWallet';
import { THEME } from '@/lib/theme';

export function SendCoinsSheet() {
  const { sendOpen, closeSend } = useWallet();

  return (
    <ChromeOverlay visible={sendOpen} onClose={closeSend}>
      <View
        className="flex-1"
        style={{
          backgroundColor: THEME.background,
          borderTopLeftRadius: THEME.radiusLg,
          borderTopRightRadius: THEME.radiusLg,
          maxHeight: '100%',
          minHeight: '72%',
        }}>
        <View className="items-center pt-3">
          <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
        </View>
        <SendCoinsPanel onClose={closeSend} />
      </View>
    </ChromeOverlay>
  );
}
