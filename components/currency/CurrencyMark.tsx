import { Image } from 'expo-image';
import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { asWalletCurrency, formatWalletNumber } from '@/lib/currency';
import { THEME } from '@/lib/theme';

const COIN = require('@/assets/currency/blob-coin.png');
const BUCK = require('@/assets/currency/blob-buck.png');

type CurrencyMarkProps = {
  currency?: string | null;
  size?: number;
  showLabel?: boolean;
};

export function CurrencyMark({ currency, size = 28, showLabel = false }: CurrencyMarkProps) {
  const kind = asWalletCurrency(currency);
  return (
    <View className="flex-row items-center">
      <Image
        source={kind === 'bucks' ? BUCK : COIN}
        style={{ width: size, height: size, backgroundColor: 'transparent' }}
        contentFit="contain"
        contentPosition="center"
        cachePolicy="memory-disk"
        accessibilityLabel={kind === 'bucks' ? 'Blob Bucks' : 'Blob Coins'}
      />
      {showLabel ? (
        <AppText
          className="ml-1.5 text-[12px] font-bold"
          style={{ color: kind === 'bucks' ? '#1B7A4A' : THEME.primary }}>
          {kind === 'bucks' ? 'Bucks' : 'Coins'}
        </AppText>
      ) : null}
    </View>
  );
}

type StakeAmountProps = {
  amount: number | null | undefined;
  currency?: string | null;
  size?: number;
  freeLabel?: string;
  textClassName?: string;
  zeroAsNumber?: boolean;
};

export function StakeAmount({
  amount,
  currency,
  size = 13,
  freeLabel = 'Free',
  textClassName = 'text-[11px] font-semibold text-charcoal',
  zeroAsNumber = false,
}: StakeAmountProps) {
  const value = Number(amount ?? 0);
  if (value <= 0 && !zeroAsNumber) {
    return <AppText className={textClassName}>{freeLabel}</AppText>;
  }
  return (
    <View className="flex-row items-center">
      <CurrencyMark currency={currency} size={size} />
      <AppText className={`ml-0.5 ${textClassName}`}>
        {value <= 0 ? '0' : formatWalletNumber(value)}
      </AppText>
    </View>
  );
}
