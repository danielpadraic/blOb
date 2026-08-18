import { View } from 'react-native';

import { BucksTag } from '@/components/currency/BucksTag';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { formatWallet, isBucksChallenge, isSponsoredBucks } from '@/lib/currency';
import type { Challenge } from '@/lib/types';

type JoinBarProps = {
  challenge: Challenge;
  loading?: boolean;
  disabledReason?: string | null;
  onJoin: () => void;
};

export function JoinBar({
  challenge,
  loading,
  disabledReason,
  onJoin,
}: JoinBarProps) {
  const buyInAmount = Math.max(Number(challenge.buy_in_amount) || 0, 0);
  const isFree = buyInAmount <= 0;
  const bucks = isBucksChallenge(challenge);
  const money = (amount: number) => formatWallet(amount, challenge.currency);
  return (
    <Card className="gap-3">
      {bucks ? <BucksTag challenge={challenge} /> : null}
      <View className="flex-row items-end justify-between">
        <View>
          <AppText className="text-xs uppercase tracking-widest text-muted">
            {isFree ? 'Entry' : 'Buy-in'}
          </AppText>
          <AppText className="text-2xl font-bold text-charcoal">
            {isFree ? (isSponsoredBucks(challenge) ? 'Free · pays Bucks' : 'Free') : money(buyInAmount)}
          </AppText>
        </View>
        <View className="items-end">
          <AppText className="text-xs uppercase tracking-widest text-muted">On the line</AppText>
          <AppText className="text-lg font-semibold text-coral">
            {money(challenge.prize_pool)}
          </AppText>
        </View>
      </View>
      {disabledReason ? (
        <AppText className="text-sm text-muted">{disabledReason}</AppText>
      ) : (
        <AppText className="text-sm text-muted">
          {isFree
            ? bucks
              ? 'Joining is free. The prize is still paid in real-money Bucks.'
              : 'Joining is free. The prize pool is already funded.'
            : bucks
              ? 'Bucks move into the prize pool the moment you join. This cannot be reversed.'
              : 'Coins move into the prize pool the moment you join. Finish, or lose the buy-in.'}
        </AppText>
      )}
      <Button
        title={disabledReason ? 'Unavailable' : isFree ? 'Join free' : `Join for ${money(buyInAmount)}`}
        onPress={onJoin}
        loading={loading}
        disabled={Boolean(disabledReason)}
      />
    </Card>
  );
}
