import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WalletHome } from '@/components/wallet/WalletHome';
import { Screen } from '@/components/ui/Screen';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';

export default function SettlementHistoryScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Screen scroll edges={['top', 'left', 'right']} contentPaddingBottom={Math.max(insets.bottom, 16) + 24}>
      <View className="mb-3 flex-row items-center" style={{ minHeight: 44 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close"
          onPress={() => router.back()}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <Glyph name={GLYPH.chevronLeft} color={THEME.textPrimary} size={18} />
        </Pressable>
        <AppText className="flex-1 text-center text-lg font-bold" style={{ color: THEME.textPrimary }}>
          Settlements
        </AppText>
        <View style={{ width: 44 }} />
      </View>
      <WalletHome />
    </Screen>
  );
}
