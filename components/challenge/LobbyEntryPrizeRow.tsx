import { View } from 'react-native';

import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { EntryFeeAmount } from '@/components/currency/EntryFeeAmount';
import { AppText } from '@/components/ui/AppText';
import { displayChallengePot } from '@/lib/challengePot';
import { formatCashPrizeAmount, isBucksChallenge } from '@/lib/currency';

type PrizeChallenge = {
  buy_in_amount?: number | null;
  currency?: string | null;
  prize_pool?: number | null;
  settled_prize_pool?: number | null;
  host_budget?: number | null;
  creator_contribution?: number | null;
  status?: string | null;
};

export function LobbyEntryPrizeRow({
  challenge,
  color,
  compact = false,
  light = false,
}: {
  challenge: PrizeChallenge;
  color: string;
  compact?: boolean;
  light?: boolean;
}) {
  const type = compact ? 'text-[11px] font-extrabold' : 'text-[14px] font-extrabold';
  const icon = compact ? 12 : 15;
  const prize = displayChallengePot(challenge);
  const prizeColor = light ? '#FFFFFF' : color;

  return (
    <View
      className="flex-row items-center justify-between"
      style={{ width: '100%', paddingRight: compact ? 8 : 12, minHeight: compact ? 18 : 22 }}>
      <EntryFeeAmount
        amount={challenge.buy_in_amount}
        currency={challenge.currency}
        textClassName={type}
        color={prizeColor}
        size={icon}
        labeled
      />
      {isBucksChallenge(challenge) ? (
        <AppText className={type} style={{ color: prizeColor }}>
          {formatCashPrizeAmount(prize)}
        </AppText>
      ) : (
        <View className="flex-row items-center" style={{ gap: compact ? 3 : 4 }}>
          <CurrencyMark currency={challenge.currency} size={icon} />
          <AppText className={type} style={{ color: prizeColor }}>
            {String(Math.round(prize))}
          </AppText>
        </View>
      )}
    </View>
  );
}
