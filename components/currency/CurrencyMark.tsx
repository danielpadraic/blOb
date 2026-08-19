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
  accessibilityLabel?: string;
};

export function CurrencyMark({
  currency,
  size = 28,
  showLabel = false,
  accessibilityLabel,
}: CurrencyMarkProps) {
  const kind = asWalletCurrency(currency);
  const label = accessibilityLabel ?? (kind === 'bucks' ? 'Blob Bucks' : 'Blob Coins');
  return (
    <View className="flex-row items-center">
      <Image
        source={kind === 'bucks' ? BUCK : COIN}
        style={{ width: size, height: size, backgroundColor: 'transparent' }}
        contentFit="contain"
        contentPosition="center"
        cachePolicy="memory-disk"
        accessibilityLabel={label}
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

type BuckUsdAmountProps = {
  amount: number | null | undefined;
  size?: number;
  textClassName?: string;
  color?: string;
};

/** Buck icon + $0.00. Never prints the word Bucks. */
export function BuckUsdAmount({
  amount,
  size = 14,
  textClassName = 'text-[12px] font-extrabold text-charcoal',
  color,
}: BuckUsdAmountProps) {
  const value = Number(amount ?? 0);
  return (
    <View className="flex-row items-center">
      <CurrencyMark currency="bucks" size={size} accessibilityLabel="$" />
      <AppText className={`ml-0.5 ${textClassName}`} style={color ? { color } : undefined}>
        {`$${value.toFixed(2)}`}
      </AppText>
    </View>
  );
}
