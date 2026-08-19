import { useState } from 'react';
import { View } from 'react-native';
import { useRouter } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { Input } from '@/components/ui/Input';
import { AppText } from '@/components/ui/AppText';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useProfile';
import { useWallet } from '@/hooks/useWallet';
import { formatCash } from '@/lib/currency';
import { challengeDetailHref } from '@/lib/routes';
import { startWebCardTopUp } from '@/lib/topUp';
import { THEME } from '@/lib/theme';
import { getErrorMessage } from '@/utils/errors';

export function TopUpSheet() {
  const router = useRouter();
  const { user } = useAuth();
  const { refetch } = useMyProfile();
  const { topUp, closeTopUp } = useWallet();
  const [name, setName] = useState('');
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvc, setCvc] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!topUp) {
    return null;
  }

  const amountLabel = formatCash(topUp.amount);

  async function onPay() {
    if (!user || !topUp) {
      return;
    }
    const digits = number.replace(/\D/g, '');
    if (name.trim().length < 2 || digits.length < 13 || expiry.replace(/\D/g, '').length < 4 || cvc.length < 3) {
      setError('Enter a valid card to add this amount.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await startWebCardTopUp({
        amount: topUp.amount,
        challengeId: topUp.returnChallengeId ?? '',
        userId: user.id,
      });
      if (result === 'cancel') {
        return;
      }
      if (result === 'unavailable') {
        setError('Card top-up isn’t available in this build. Use the web card path.');
        return;
      }
      await refetch();
      const challengeId = topUp.returnChallengeId;
      closeTopUp();
      if (challengeId) {
        router.replace(challengeDetailHref(challengeId, 'feed'));
      }
    } catch (err) {
      setError(getErrorMessage(err));
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
          <AppText className="mt-3 text-lg font-bold text-charcoal">Add {amountLabel}</AppText>
          <AppText className="mt-1 text-center text-[13px] leading-5 text-muted">
            Pay with card. This adds {amountLabel} to your wallet, then brings you back to the challenge.
          </AppText>
        </View>
        <View className="gap-3">
          <Input label="Name on card" value={name} onChangeText={setName} autoCapitalize="words" />
          <Input
            label="Card number"
            value={number}
            onChangeText={setNumber}
            keyboardType="number-pad"
            placeholder="ACCT-000015"
          />
          <View className="flex-row gap-3">
            <View className="flex-1">
              <Input
                label="Expiry"
                value={expiry}
                onChangeText={setExpiry}
                placeholder="MM/YY"
                keyboardType="number-pad"
              />
            </View>
            <View className="flex-1">
              <Input
                label="CVC"
                value={cvc}
                onChangeText={setCvc}
                keyboardType="number-pad"
                secureTextEntry
              />
            </View>
          </View>
          {error ? (
            <AppText className="text-[13px] leading-5 text-coral-dark">{error}</AppText>
          ) : null}
          <Button title={`Pay ${amountLabel}`} size="lg" loading={busy} onPress={() => void onPay()} />
          <Button title="Not now" variant="ghost" onPress={closeTopUp} disabled={busy} />
        </View>
      </View>
    </ChromeOverlay>
  );
}
