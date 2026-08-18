import { Pressable, View } from 'react-native';

import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { AppText } from '@/components/ui/AppText';
import { useMyProfile } from '@/hooks/useProfile';
import { useWalletOptional } from '@/hooks/useWallet';
import { THEME } from '@/lib/theme';
import { formatBucks, formatCoins } from '@/utils/format';

export function WalletBar() {
  const { profile } = useMyProfile();
  const wallet = useWalletOptional();
  if (!profile || !wallet) {
    return null;
  }

  const coins = Number(profile.coins ?? profile.credits ?? 0);
  const bucks = Number(profile.bucks ?? 0);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Open wallet"
      onPress={wallet.openWallet}
      className="flex-row items-center"
      style={{
        backgroundColor: THEME.surface,
        borderColor: THEME.border,
        borderWidth: 1,
        borderRadius: 999,
        paddingVertical: 6,
        paddingHorizontal: 10,
      }}
      hitSlop={6}>
      <View className="flex-row items-center">
        <CurrencyMark currency="coins" size={18} />
        <AppText className="ml-1.5 text-[12px] font-extrabold text-charcoal">
          {formatCoins(coins).replace(' Coins', '')}
        </AppText>
      </View>
      <AppText className="mx-1.5 text-[12px] font-extrabold text-muted">·</AppText>
      <View className="flex-row items-center">
        <CurrencyMark currency="bucks" size={18} />
        <AppText className="ml-1 text-[12px] font-extrabold" style={{ color: '#1B7A4A' }}>
          {formatBucks(bucks).replace(' Bucks', '')}
        </AppText>
      </View>
    </Pressable>
  );
}
