import { AppText } from '@/components/ui/AppText';
import { StakeAmount } from '@/components/currency/CurrencyMark';
import { cashPrizeLabel, isBucksChallenge } from '@/lib/currency';

export function CashPrizeAmount({
  amount,
  currency,
  textClassName,
  color,
  size = 18,
}: {
  amount: number | null | undefined;
  currency?: string | null;
  textClassName: string;
  color?: string;
  size?: number;
}) {
  if (isBucksChallenge({ currency })) {
    return (
      <AppText className={textClassName} style={color ? { color } : undefined}>
        {cashPrizeLabel(amount)}
      </AppText>
    );
  }
  return (
    <StakeAmount
      amount={amount}
      currency={currency}
      size={size}
      zeroAsNumber
      textClassName={textClassName}
    />
  );
}
