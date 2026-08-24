import { View } from 'react-native';

import { CurrencyMark, StakeAmount } from '@/components/currency/CurrencyMark';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { payoutDisplayName, personalSettlementCopy } from '@/lib/settlement';
import { THEME } from '@/lib/theme';
import type { ChallengeSettlementView } from '@/lib/types';
import { formatWallet } from '@/lib/currency';
import { formatDate } from '@/utils/format';

type SettlementSummaryProps = {
  settlement: ChallengeSettlementView;
  userId?: string;
  joined: boolean;
  daysCompleted?: number | null;
  targetCount?: number | null;
  currency?: string | null;
  official?: boolean;
};

export function SettlementSummary({
  settlement,
  userId,
  joined,
  daysCompleted,
  targetCount,
  currency,
  official = false,
}: SettlementSummaryProps) {
  const mine = settlement.payouts.find((payout) => payout.user_id === userId);
  const personal = personalSettlementCopy({
    payout: mine,
    prizeStructure: settlement.settlement.prize_structure,
    daysCompleted,
    targetCount,
    joined,
    currency,
    official,
    winnerCount: settlement.settlement.winner_count,
  });
  const pool = Number(settlement.settlement.prize_pool ?? 0);
  const paid = Number(settlement.settlement.distributed ?? 0);
  const winners = Math.max(Number(settlement.settlement.winner_count) || settlement.payouts.length, 0);

  return (
    <View className="gap-3">
      <Card style={{ backgroundColor: THEME.accentSoft, borderColor: THEME.accentSoft }}>
        <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
          Receipt
        </AppText>
        <AppText className="mt-2 text-[22px] font-bold leading-7 text-charcoal">{personal}</AppText>
        <View className="mt-3 flex-row gap-3">
          <View className="flex-1">
            <AppText className="text-[9px] font-semibold uppercase tracking-wide text-muted">
              Pool
            </AppText>
            <View className="mt-0.5">
              <StakeAmount
                amount={pool > 0 ? pool : paid}
                currency={currency}
                size={16}
                zeroAsNumber
                textClassName="text-[15px] font-bold text-charcoal"
              />
            </View>
          </View>
          <View className="flex-1">
            <AppText className="text-[9px] font-semibold uppercase tracking-wide text-muted">
              Winners
            </AppText>
            <AppText className="mt-0.5 text-[15px] font-bold text-charcoal">{winners}</AppText>
          </View>
          <View className="flex-1">
            <AppText className="text-[9px] font-semibold uppercase tracking-wide text-muted">
              Your share
            </AppText>
            {mine && Number(mine.amount) > 0 ? (
              <View className="mt-0.5">
                <StakeAmount
                  amount={mine.amount}
                  currency={currency}
                  size={16}
                  zeroAsNumber
                  textClassName="text-[15px] font-bold text-charcoal"
                />
              </View>
            ) : (
              <View className="mt-0.5 flex-row items-center gap-1">
                <CurrencyMark currency={currency} size={16} />
                <AppText className="text-[15px] font-bold text-charcoal">0</AppText>
              </View>
            )}
          </View>
        </View>
        <AppText className="mt-3 text-sm leading-5 text-muted">
          {winners === 0
            ? 'Nobody remaining. The prize is forfeited. No refunds.'
            : `Paid ${formatWallet(paid || pool, currency)} on ${formatDate(settlement.settlement.settled_at, 'MMM d')}.`}
        </AppText>
      </Card>

      {settlement.payouts.length > 0 ? (
        <Card>
          <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
            Paid to
          </AppText>
          <View className="mt-3 gap-3">
            {settlement.payouts.map((payout) => {
              const isYou = payout.user_id === userId;
              return (
                <View key={`${payout.user_id}-${payout.place}`} className="flex-row items-center gap-3">
                  <View className="flex-1">
                    <AppText className="font-semibold text-charcoal">
                      {isYou ? 'You' : payoutDisplayName(payout)}
                    </AppText>
                  </View>
                  <StakeAmount
                    amount={payout.amount}
                    currency={currency}
                    size={14}
                    zeroAsNumber
                    textClassName="text-[14px] font-bold text-charcoal"
                  />
                </View>
              );
            })}
          </View>
        </Card>
      ) : null}
    </View>
  );
}
