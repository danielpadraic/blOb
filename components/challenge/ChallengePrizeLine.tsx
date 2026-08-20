import { View } from 'react-native';

import { StakeAmount } from '@/components/currency/CurrencyMark';
import { AppText } from '@/components/ui/AppText';
import { prizeDistributionLabel } from '@/lib/challenges';
import { formatCash, isBucksChallenge } from '@/lib/currency';
import type { Challenge } from '@/lib/types';

export function ChallengePrizeLine({
  challenge,
  textClassName = 'text-[17px] font-semibold leading-6 text-charcoal',
}: {
  challenge: Pick<
    Challenge,
    | 'prize_pool'
    | 'currency'
    | 'prize_structure'
    | 'top_places_distribution'
    | 'is_unlimited'
  >;
  textClassName?: string;
}) {
  const amount = Number(challenge.prize_pool) || 0;
  const distribution = prizeDistributionLabel(challenge);
  if (isBucksChallenge(challenge)) {
    return (
      <AppText className={textClassName}>
        {formatCash(amount)} · {distribution}
      </AppText>
    );
  }
  return (
    <View className="flex-row flex-wrap items-center" style={{ gap: 6 }}>
      <StakeAmount
        amount={amount}
        currency={challenge.currency}
        size={18}
        zeroAsNumber
        textClassName={textClassName}
      />
      <AppText className={textClassName}>· {distribution}</AppText>
    </View>
  );
}
