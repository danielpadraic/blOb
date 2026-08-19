import { Pressable, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { copy } from '@/lib/copy';
import { isBucksChallenge } from '@/lib/currency';
import { THEME } from '@/lib/theme';
import type { Challenge } from '@/lib/types';

type CancelChallengeSheetProps = {
  visible: boolean;
  challenge: Challenge;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

export function cancelConfirmCopy(challenge: Pick<Challenge, 'buy_in_amount' | 'currency' | 'is_official'>): string {
  if (isBucksChallenge(challenge) || Math.max(Number(challenge.buy_in_amount) || 0, 0) <= 0) {
    return copy('challenge.cancelConfirmFree');
  }
  return copy('challenge.cancelConfirmCoins');
}

export function CancelChallengeSheet({
  visible,
  challenge,
  loading,
  error,
  onClose,
  onConfirm,
}: CancelChallengeSheetProps) {
  function close() {
    if (loading) {
      return;
    }
    onClose();
  }

  return (
    <ChromeOverlay visible={visible} onClose={close}>
      <Pressable
        className="px-5 pb-10 pt-6"
        style={{
          backgroundColor: THEME.background,
          borderTopLeftRadius: THEME.radiusLg,
          borderTopRightRadius: THEME.radiusLg,
        }}
        onPress={(event) => event.stopPropagation()}>
        <AppText className="text-2xl font-bold text-charcoal">{copy('challenge.cancel')}</AppText>
        <AppText className="mt-2 text-muted">{cancelConfirmCopy(challenge)}</AppText>
        <View className="mt-6 gap-3">
          {error ? (
            <AppText className="text-sm leading-5 text-coral-dark">{error}</AppText>
          ) : null}
          <Button
            title={copy('challenge.cancel')}
            size="lg"
            variant="danger"
            loading={loading}
            onPress={onConfirm}
          />
          <Button title={copy('challenge.cancelKeep')} variant="ghost" onPress={close} disabled={loading} />
        </View>
      </Pressable>
    </ChromeOverlay>
  );
}
