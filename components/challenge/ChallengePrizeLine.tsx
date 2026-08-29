import { View } from 'react-native';

import { StakeAmount } from '@/components/currency/CurrencyMark';
import { AppText } from '@/components/ui/AppText';
import { prizeDistributionLabel } from '@/lib/challenges';
import { displayChallengePot } from '@/lib/challengePot';
import { cashPrizeLabel, isBucksChallenge } from '@/lib/currency';
import type { Challenge } from '@/lib/types';

export function ChallengePrizeLine({
  challenge,
  textClassName = 'text-[17px] font-semibold leading-6 text-charcoal',
}: {
  challenge: Pick<
    Challenge,
    | 'status'
    | 'prize_pool'
    | 'settled_prize_pool'
    | 'host_budget'
    | 'creator_contribution'
    | 'currency'
    | 'prize_structure'
    | 'top_places_distribution'
    | 'is_unlimited'
  >;
  textClassName?: string;
}) {
  const amount = displayChallengePot(challenge);
  const distribution = prizeDistributionLabel(challenge);
  if (isBucksChallenge(challenge)) {
    return (
      <AppText className={textClassName}>
        {cashPrizeLabel(amount)} · {distribution}
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
