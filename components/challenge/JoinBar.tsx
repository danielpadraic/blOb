import { View } from 'react-native';

import { ChallengeTagRow } from '@/components/challenge/ChallengeTag';
import { JoinCtaButton } from '@/components/challenge/JoinCtaButton';
import { StakeAmount } from '@/components/currency/CurrencyMark';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { challengeCardTags } from '@/lib/challengeTags';
import { formatWalletAmount } from '@/lib/currency';
import { bucksJoinCta } from '@/lib/joinCta';
import type { Challenge } from '@/lib/types';

type JoinBarProps = {
  challenge: Challenge;
  loading?: boolean;
  disabledReason?: string | null;
  walletBalance?: number;
  onJoin: () => void;
  onTopUp?: () => void;
};

export function JoinBar({
  challenge,
  loading,
  disabledReason,
  walletBalance: held = 0,
  onJoin,
  onTopUp,
}: JoinBarProps) {
  const buyInAmount = Math.max(Number(challenge.buy_in_amount) || 0, 0);
  const isFree = buyInAmount <= 0;
  const cta = bucksJoinCta({
    currency: challenge.currency,
    buyIn: buyInAmount,
    wallet: held,
    hasProfile: true,
  });
  const topUp = Boolean(cta.needsTopUp && onTopUp);
  return (
    <Card className="gap-3">
      <ChallengeTagRow tags={challengeCardTags({ challenge })} />
      <View className="flex-row items-end justify-between">
        <View>
          <AppText className="text-xs uppercase tracking-widest text-muted">
            {isFree ? 'Entry' : 'Entry fee'}
          </AppText>
          <View className="mt-0.5">
            <StakeAmount
              amount={buyInAmount}
              currency={challenge.currency}
              size={18}
              freeLabel="Free"
              textClassName="text-2xl font-bold text-charcoal"
            />
          </View>
        </View>
        <View className="items-end">
          <AppText className="text-xs uppercase tracking-widest text-muted">Prize</AppText>
          <View className="mt-0.5">
            <StakeAmount
              amount={challenge.prize_pool}
              currency={challenge.currency}
              size={18}
              zeroAsNumber
              textClassName="text-lg font-semibold text-coral"
            />
          </View>
        </View>
      </View>
      {disabledReason && !topUp ? (
        <AppText className="text-sm text-muted">{disabledReason}</AppText>
      ) : (
        <AppText className="text-sm text-muted">
          {isFree
            ? 'Joining is free. It does not take money from your wallet.'
            : `${formatWalletAmount(buyInAmount, challenge.currency)} moves into the prize the moment you join.`}
        </AppText>
      )}
      {topUp ? (
        <Button title={cta.topUpLabel} onPress={onTopUp} loading={loading} />
      ) : disabledReason ? (
        <Button title="Unavailable" onPress={onJoin} disabled />
      ) : (
        <JoinCtaButton
          currency={challenge.currency}
          amount={buyInAmount}
          loading={loading}
          onPress={onJoin}
        />
      )}
    </Card>
  );
}
