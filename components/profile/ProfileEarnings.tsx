import { View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { AppText } from '@/components/ui/AppText';
import { THEME } from '@/lib/theme';
import { formatCoins, formatUsd } from '@/utils/format';

type ProfileEarningsProps = {
  coins: number;
  bucks: number;
};

export function ProfileEarnings({ coins, bucks }: ProfileEarningsProps) {
  return (
    <View className="gap-2">
      <AppText className="text-[12px] font-bold uppercase tracking-widest text-charcoal">
        Total Earnings
      </AppText>
      <View className="flex-row gap-2">
        <View className="flex-1 overflow-hidden" style={{ borderRadius: THEME.radius }}>
          <LinearGradient
            colors={['#1A1C1A', '#131515']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingHorizontal: 12, paddingVertical: 12 }}>
            <View className="flex-row items-center">
              <CurrencyMark currency="coins" size={28} />
              <AppText
                className="ml-1.5 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: '#E6C35C' }}>
                Coins
              </AppText>
            </View>
            <AppText className="mt-2 text-[20px] font-bold" style={{ color: '#FFF6D6' }}>
              {formatCoins(coins).replace(' Coins', '')}
            </AppText>
            <AppText className="mt-0.5 text-[11px]" style={{ color: 'rgba(255,246,214,0.62)' }}>
              Lifetime prizes
            </AppText>
          </LinearGradient>
        </View>

        <View className="flex-1 overflow-hidden" style={{ borderRadius: THEME.radius }}>
          <LinearGradient
            colors={['#1B7A4A', '#143D28']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{ paddingHorizontal: 12, paddingVertical: 12 }}>
            <View className="flex-row items-center">
              <CurrencyMark currency="bucks" size={28} />
              <AppText
                className="ml-1.5 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: '#C8E6C9' }}>
                $
              </AppText>
            </View>
            <AppText className="mt-2 text-[20px] font-bold" style={{ color: '#F4FFF6' }}>
              {Number(bucks).toFixed(2)}
            </AppText>
            <AppText className="mt-0.5 text-[11px]" style={{ color: 'rgba(244,255,246,0.7)' }}>
              {formatUsd(bucks)} earned
            </AppText>
          </LinearGradient>
        </View>
      </View>
    </View>
  );
}
