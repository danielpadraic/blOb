import { View } from 'react-native';

import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { AppText } from '@/components/ui/AppText';
import { THEME, themeShadow } from '@/lib/theme';
import type { Profile } from '@/lib/types';
import { formatBucks, formatCoins, formatUsd } from '@/utils/format';

type WalletBalancesProps = {
  profile: Pick<Profile, 'coins' | 'bucks' | 'credits'>;
};

export function WalletBalances({ profile }: WalletBalancesProps) {
  const coins = Number(profile.coins ?? profile.credits ?? 0);
  const bucks = Number(profile.bucks ?? 0);

  return (
    <View className="flex-row gap-2">
      <View
        className="flex-1 flex-row items-center justify-between px-3 py-3"
        style={{
          backgroundColor: THEME.surface,
          borderColor: THEME.border,
          borderWidth: 1,
          borderRadius: THEME.radius,
          ...themeShadow('card'),
        }}>
        <View className="flex-row items-center">
          <CurrencyMark currency="coins" size={22} />
          <AppText className="ml-1.5 text-[11px] font-semibold text-muted">Coins</AppText>
        </View>
        <AppText className="text-[15px] font-extrabold text-charcoal">
          {formatCoins(coins).replace(' Coins', '')}
        </AppText>
      </View>

      <View
        className="flex-1 flex-row items-center justify-between px-3 py-3"
        style={{
          backgroundColor: THEME.surface,
          borderColor: THEME.border,
          borderWidth: 1,
          borderRadius: THEME.radius,
          ...themeShadow('card'),
        }}>
        <View className="flex-row items-center">
          <CurrencyMark currency="bucks" size={22} />
          <View className="ml-1.5">
            <AppText className="text-[11px] font-semibold text-muted">Bucks</AppText>
            <AppText className="text-[9px] text-muted">
              1 = {formatUsd(1).replace(' USD', '')}
            </AppText>
          </View>
        </View>
        <AppText className="text-[15px] font-extrabold" style={{ color: '#1B7A4A' }}>
          {formatBucks(bucks).replace(' Bucks', '')}
        </AppText>
      </View>
    </View>
  );
}
