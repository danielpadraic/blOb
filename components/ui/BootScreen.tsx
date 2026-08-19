import { View } from 'react-native';

import { BlobMascot } from '@/components/mascot/BlobMascot';
import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

export function BootScreen() {
  return (
    <View className="flex-1 items-center justify-center" style={{ backgroundColor: THEME.background }}>
      <BlobMascot size={220} motion="pulse" />
      <AppText className="mt-6" style={{ color: THEME.textMuted }}>
        blOb is waking up…
      </AppText>
    </View>
  );
}
