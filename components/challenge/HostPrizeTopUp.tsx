import { useState } from 'react';
import { View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { AppText } from '@/components/ui/AppText';
import { Stepper } from '@/components/ui/Stepper';
import { useTopUpChallengePrize } from '@/hooks/useChallenge';
import { useMyProfile } from '@/hooks/useProfile';
import { useWalletOptional } from '@/hooks/useWallet';
import { formatCash, formatWallet, isBucksChallenge, walletBalance } from '@/lib/currency';
import { FUNDING_COPY, canHostTopUp, joinShortfall } from '@/lib/funding';
import type { Challenge } from '@/lib/types';

export function HostPrizeTopUp({
  challenge,
  isHost,
}: {
  challenge: Pick<Challenge, 'id' | 'status' | 'is_official' | 'currency'>;
  isHost: boolean;
}) {
  const { profile } = useMyProfile();
  const walletSheet = useWalletOptional();
  const topUp = useTopUpChallengePrize();
  const [amount, setAmount] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (
    !canHostTopUp({
      status: challenge.status,
      isHost,
      official: Boolean(challenge.is_official),
    })
  ) {
    return null;
  }

  const cash = isBucksChallenge(challenge);
  const wallet = walletBalance(profile, challenge.currency);
  const shortfall = joinShortfall(wallet, amount);

  async function submit() {
    setError(null);
    setDone(false);
    if (shortfall > 0) {
      walletSheet?.openTopUp({ amount: shortfall, returnChallengeId: challenge.id });
      return;
    }
    try {
      await topUp.mutateAsync({ challengeId: challenge.id, amount });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : FUNDING_COPY.insufficient);
    }
  }

  return (
    <View className="gap-2">
      <AppText className="text-sm font-semibold text-charcoal">{FUNDING_COPY.addToPrize}</AppText>
      <AppText className="text-[13px] leading-5 text-muted">{FUNDING_COPY.hostHelp}</AppText>
      <View className="flex-row items-center justify-between" style={{ minHeight: 44 }}>
        <Stepper
          accessibilityLabel={FUNDING_COPY.addToPrize}
          value={amount}
          min={1}
          max={10_000}
          formatValue={cash ? formatCash : undefined}
          onChange={setAmount}
        />
      </View>
      {error ? <AppText className="text-sm text-coral-dark">{error}</AppText> : null}
      {done ? <AppText className="text-sm text-muted">{FUNDING_COPY.hostTopUpSuccess}</AppText> : null}
      <Button
        title={
          shortfall > 0
            ? `Add ${formatCash(shortfall)}`
            : cash
              ? `${FUNDING_COPY.addToPrize} ${formatCash(amount)}`
              : `${FUNDING_COPY.addToPrize} ${formatWallet(amount, challenge.currency)}`
        }
        loading={topUp.isPending}
        onPress={() => void submit()}
      />
    </View>
  );
}
