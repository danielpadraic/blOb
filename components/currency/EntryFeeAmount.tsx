import { AppText } from '@/components/ui/AppText';
import { BuckUsdAmount, StakeAmount } from '@/components/currency/CurrencyMark';
import { copy } from '@/lib/copy';
import { FREE_ENTRY_LABEL, FREE_LABEL, isBucksChallenge, isFreeEntry } from '@/lib/currency';

export function EntryFeeAmount({
  amount,
  currency,
  textClassName,
  color,
  size = 16,
  labeled = false,
}: {
  amount: number | null | undefined;
  currency?: string | null;
  textClassName: string;
  color?: string;
  size?: number;
  /** True when an “Entry” label is already shown next to this amount. */
  labeled?: boolean;
}) {
  if (isFreeEntry(amount)) {
    return (
      <AppText className={textClassName} style={color ? { color } : undefined}>
        {labeled
          ? copy('create.free') || FREE_LABEL
          : copy('create.freeEntry') || FREE_ENTRY_LABEL}
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
