import { AppText } from '@/components/ui/AppText';
import { BuckUsdAmount, StakeAmount } from '@/components/currency/CurrencyMark';
import { copy } from '@/lib/copy';
import { FREE_ENTRY_LABEL, isBucksChallenge, isFreeEntry } from '@/lib/currency';

export function EntryFeeAmount({
  amount,
  currency,
  textClassName,
  color,
  size = 16,
}: {
  amount: number | null | undefined;
  currency?: string | null;
  textClassName: string;
  color?: string;
  size?: number;
}) {
  if (isFreeEntry(amount)) {
    return (
      <AppText className={textClassName} style={color ? { color } : undefined}>
        {copy('create.freeEntry') || FREE_ENTRY_LABEL}
      </AppText>
    );
  }
  if (isBucksChallenge({ currency })) {
    return <BuckUsdAmount amount={amount} textClassName={textClassName} color={color} />;
  }
  return (
    <StakeAmount
      amount={amount}
      currency={currency}
      size={size}
      textClassName={textClassName}
    />
  );
}
