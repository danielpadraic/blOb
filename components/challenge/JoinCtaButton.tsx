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
  onPress: () => void;
};

/** Coins: Join + coin icon + amount. Cash: “Join $1.00”. Never a naked “Join 10”. */
export function JoinCtaButton({
  currency,
  amount,
  loading = false,
  disabled = false,
  onPress,
}: JoinCtaButtonProps) {
  const buyIn = Math.max(Number(amount) || 0, 0);
  const cash = isBucksChallenge({ currency });
  const free = buyIn <= 0;
  const isDisabled = Boolean(disabled || loading);
  const a11y = free
    ? 'Join free'
    : cash
      ? `Join ${formatCash(buyIn)}`
      : `Join ${formatWalletNumber(buyIn)} coins`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      disabled={isDisabled}
      onPress={onPress}
      style={{
        height: JOIN_CTA_HEIGHT,
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
          Join free
        </AppText>
      ) : cash ? (
        <AppText
          className="text-[16px] font-semibold"
          style={{ color: THEME.primaryForeground }}>
          {`Join ${formatCash(buyIn)}`}
        </AppText>
      ) : (
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <AppText
            className="text-[16px] font-semibold"
            style={{ color: THEME.primaryForeground }}>
            Join
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
