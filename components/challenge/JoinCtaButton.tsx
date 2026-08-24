import { ActivityIndicator, Pressable, View } from 'react-native';

import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { AppText } from '@/components/ui/AppText';
import { formatCash, formatWalletNumber, isBucksChallenge } from '@/lib/currency';
import { THEME } from '@/lib/theme';

export const JOIN_CTA_HEIGHT = 48;

type JoinCtaButtonProps = {
  currency?: string | null;
  amount: number;
  loading?: boolean;
  disabled?: boolean;
  verb?: 'Join' | 'Pay' | 'Participate';
  size?: 'md' | 'lg';
  onPress: () => void;
};

/** Coins: verb + coin icon + amount. Cash: “Join $1.00”. Never the word “Coins.” */
export function JoinCtaButton({
  currency,
  amount,
  loading = false,
  disabled = false,
  verb = 'Participate',
  size = 'md',
  onPress,
}: JoinCtaButtonProps) {
  const buyIn = Math.max(Number(amount) || 0, 0);
  const cash = isBucksChallenge({ currency });
  const free = buyIn <= 0;
  const isDisabled = Boolean(disabled || loading);
  const height = size === 'lg' ? 56 : JOIN_CTA_HEIGHT;
  const a11y = free
    ? `${verb} free`
    : cash
      ? `${verb} ${formatCash(buyIn)}`
      : `${verb} ${formatWalletNumber(buyIn)}`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={{
        height,
        width: '100%',
        backgroundColor: THEME.primary,
        borderRadius: THEME.radiusSm,
        opacity: isDisabled ? 0.38 : 1,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 16,
      }}>
      {loading ? (
        <ActivityIndicator color={THEME.primaryForeground} />
      ) : free ? (
        <AppText
          className="text-[16px] font-semibold"
          style={{ color: THEME.primaryForeground }}>
          {`${verb} free`}
        </AppText>
      ) : cash ? (
        <AppText
          className="text-[16px] font-semibold"
          style={{ color: THEME.primaryForeground }}>
          {`${verb} ${formatCash(buyIn)}`}
        </AppText>
      ) : (
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <AppText
            className="text-[16px] font-semibold"
            style={{ color: THEME.primaryForeground }}>
            {verb}
          </AppText>
          <CurrencyMark currency="coins" size={18} />
          <AppText
            className="text-[16px] font-semibold"
            style={{ color: THEME.primaryForeground }}>
            {formatWalletNumber(buyIn)}
          </AppText>
        </View>
      )}
    </Pressable>
  );
}
