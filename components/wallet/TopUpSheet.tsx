import { useState } from 'react';
import { View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { useMyProfile } from '@/hooks/useProfile';
import { useWallet } from '@/hooks/useWallet';
import { formatCash } from '@/lib/currency';
import { challengeDetailHref } from '@/lib/routes';
import { startCardTopUp } from '@/lib/topUp';
import { TOPUP_COPY, classifyTopUpError, quoteTopUp, topUpErrorCopy } from '@/lib/topup';
import { THEME } from '@/lib/theme';

export function TopUpSheet() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { refetch } = useMyProfile();
  const { topUp, closeTopUp } = useWallet();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [kind, setKind] = useState<'error' | 'pending' | 'success' | null>(null);

  if (!topUp) {
    return null;
  }

  const quote = quoteTopUp(topUp.amount);
  const amountLabel = formatCash(quote?.creditAmount ?? topUp.amount);

  async function finish(next?: 'create' | string) {
    await refetch();
    void queryClient.invalidateQueries({ queryKey: ['profile'] });
    void queryClient.invalidateQueries({ queryKey: ['wallet-ledger'] });
    closeTopUp();
    if (next === 'create' || topUp.returnCreate) {
      return;
    }
    if (typeof next === 'string' && next) {
      router.replace(challengeDetailHref(next, 'feed'));
    }
  }

  async function onPay() {
    if (!topUp || !quote) {
      setKind('error');
      setMessage(TOPUP_COPY.amountLimit);
      return;
    }
    setBusy(true);
    setMessage(null);
    setKind(null);
    try {
      const result = await startCardTopUp({
        amount: quote.creditAmount,
        challengeId: topUp.returnChallengeId,
        returnCreate: topUp.returnCreate,
      });
      if (result.status === 'canceled') {
        setKind('error');
        setMessage(TOPUP_COPY.canceled);
        return;
      }
      if (result.status === 'failed') {
        setKind('error');
        setMessage(topUpErrorCopy(result.code));
        return;
      }
      if (result.status === 'pending') {
        setKind('pending');
        setMessage(TOPUP_COPY.processing);
        await refetch();
        return;
      }
      setKind('success');
      setMessage(TOPUP_COPY.added(result.amount || quote.creditAmount));
      await finish(topUp.returnCreate ? 'create' : topUp.returnChallengeId);
    } catch (err) {
      setKind('error');
      setMessage(topUpErrorCopy(classifyTopUpError(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ChromeOverlay visible onClose={busy ? undefined : closeTopUp}>
      <View
        className="px-5 pb-8 pt-4"
        style={{
          backgroundColor: THEME.background,
          borderTopLeftRadius: THEME.radiusLg,
          borderTopRightRadius: THEME.radiusLg,
        }}>
        <View className="mb-3 items-center">
          <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
          <AppText className="mt-3 text-lg font-bold text-charcoal">{TOPUP_COPY.title(quote?.creditAmount ?? topUp.amount)}</AppText>
          <AppText className="mt-1 text-center text-[13px] leading-5 text-muted">
            {topUp.returnCreate
              ? TOPUP_COPY.bodyCreate(quote?.creditAmount ?? topUp.amount)
              : topUp.returnChallengeId
                ? TOPUP_COPY.bodyChallenge(quote?.creditAmount ?? topUp.amount)
                : TOPUP_COPY.body(quote?.creditAmount ?? topUp.amount)}
          </AppText>
          <AppText className="mt-2 text-center text-[13px] leading-5 text-muted">{TOPUP_COPY.feeNone}</AppText>
        </View>
        <View className="gap-3">
          {message ? (
            <AppText
              className="text-[13px] leading-5"
              style={{ color: kind === 'error' ? '#9A3B3B' : THEME.ink }}>
              {message}
            </AppText>
          ) : null}
          <Button title={TOPUP_COPY.pay(quote?.chargeAmount ?? topUp.amount)} size="lg" loading={busy} onPress={() => void onPay()} />
          <Button title={TOPUP_COPY.notNow} variant="ghost" onPress={closeTopUp} disabled={busy} />
          <AppText className="text-center text-[12px] text-muted">{amountLabel} is added to your $ balance.</AppText>
        </View>
      </View>
    </ChromeOverlay>
  );
}
