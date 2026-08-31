import { View } from 'react-native';

import { StakeAmount } from '@/components/currency/CurrencyMark';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { payoutDisplayName, resultWhyCopy, settlementVoidKind, voidReceiptCopy } from '@/lib/settlement';
import { THEME } from '@/lib/theme';
import type { Challenge, ChallengeSettlementView } from '@/lib/types';

type ChallengeResultCardProps = {
  challenge: Pick<
    Challenge,
    'format' | 'challenge_type' | 'prize_structure' | 'payout_mode' | 'top_places_distribution' | 'currency'
  >;
  settlement: ChallengeSettlementView;
  userId?: string;
};

export function ChallengeResultCard({ challenge, settlement, userId }: ChallengeResultCardProps) {
  const voidKind = settlementVoidKind({
    winnerCount: settlement.settlement.winner_count,
    payouts: settlement.payouts,
    slices: settlement.settlement.slices,
  });
  const winners = settlement.payouts.filter((row) => Number(row.amount) > 0);
  const yours = userId
    ? settlement.payouts.find((row) => row.user_id === userId && Number(row.amount) > 0)
    : null;
  const why = resultWhyCopy({
    format: challenge.format,
    challenge_type: challenge.challenge_type,
    prize_structure: challenge.prize_structure ?? settlement.settlement.prize_structure,
    payout_mode: challenge.payout_mode,
    top_places_distribution: challenge.top_places_distribution,
  });

  return (
    <Card>
      <AppText
        className="text-[11px] font-semibold uppercase tracking-widest"
        style={{ color: THEME.textMuted }}>
        Settled
      </AppText>
      {winners.length === 0 ? (
        <AppText className="mt-2 text-[17px] font-semibold leading-6" style={{ color: THEME.textPrimary }}>
          {voidReceiptCopy(voidKind)}
        </AppText>
      ) : (
        <View className="mt-3 gap-2">
          {winners.map((payout) => {
            const you = payout.user_id === userId;
            return (
              <View
                key={`${payout.user_id}-${payout.place}`}
                className="flex-row items-center"
                style={{ minHeight: 44, gap: 12 }}>
                <AppText className="flex-1 text-[15px] font-semibold" style={{ color: THEME.textPrimary }}>
                  {you ? 'You' : payoutDisplayName(payout)}
                </AppText>
                <StakeAmount
                  amount={payout.amount}
                  currency={challenge.currency}
                  size={15}
                  zeroAsNumber
                  textClassName="text-[15px] font-bold text-charcoal"
                />
              </View>
            );
          })}
        </View>
      )}
      {winners.length > 0 ? (
        <AppText className="mt-2 text-sm leading-5" style={{ color: THEME.textMuted }}>
          {userId && !yours ? 'No payout.' : why}
        </AppText>
      ) : null}
    </Card>
  );
}
