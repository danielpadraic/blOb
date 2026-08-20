import { View } from 'react-native';

import { ChallengeTagRow } from '@/components/challenge/ChallengeTag';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { AppText } from '@/components/ui/AppText';
import { challengeCardTags } from '@/lib/challengeTags';
import { formatCash, formatWallet, isBucksChallenge } from '@/lib/currency';
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
  const bucks = isBucksChallenge(challenge);
  const money = (amount: number) =>
    bucks ? formatCash(amount) : formatWallet(amount, challenge.currency);
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
          <AppText className="text-2xl font-bold text-charcoal">
            {isFree ? 'Free' : money(buyInAmount)}
          </AppText>
        </View>
        <View className="items-end">
          <AppText className="text-xs uppercase tracking-widest text-muted">Prize</AppText>
          <AppText className="text-lg font-semibold text-coral">{money(challenge.prize_pool)}</AppText>
        </View>
      </View>
      {disabledReason && !topUp ? (
        <AppText className="text-sm text-muted">{disabledReason}</AppText>
      ) : (
        <AppText className="text-sm text-muted">
          {isFree
            ? 'Joining is free. It does not take money from your wallet.'
            : `${money(buyInAmount)} moves into the prize the moment you join.`}
        </AppText>
      )}
      <Button
        title={
          topUp
            ? cta.topUpLabel
            : disabledReason
              ? 'Unavailable'
              : isFree
                ? 'Join free'
                : cta.joinLabel
        }
        onPress={topUp ? onTopUp : onJoin}
        loading={loading}
        disabled={Boolean(disabledReason) && !topUp}
      />
    </Card>
  );
}
