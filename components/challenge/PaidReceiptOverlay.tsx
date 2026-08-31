import { useEffect } from 'react';
import { BackHandler, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SettlementSummary } from '@/components/challenge/SettlementSummary';
import { BlobMascot } from '@/components/mascot/BlobMascot';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import { THEME, themeShadow } from '@/lib/theme';
import type { Challenge, ChallengeSettlementView } from '@/lib/types';

type PaidReceiptOverlayProps = {
  visible: boolean;
  challenge: Pick<
    Challenge,
    'id' | 'title' | 'task' | 'currency' | 'is_official' | 'buy_in_amount' | 'creator_contribution' | 'prize_pool'
  >;
  settlement: ChallengeSettlementView;
  userId?: string;
  joined: boolean;
  onClose: () => void;
};

export function PaidReceiptOverlay({
  visible,
  challenge,
  settlement,
  userId,
  joined,
  onClose,
}: PaidReceiptOverlayProps) {
  const insets = useSafeAreaInsets();
  const name = challengeDisplayTitle(challenge) || 'this challenge';
  const mine = settlement.payouts.find((row) => row.user_id === userId);
  const paid = joined && Number(mine?.amount) > 0;

  useEffect(() => {
    if (!visible) {
      return;
    }
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, onClose]);

  return (
    <ChromeOverlay visible={visible} onClose={onClose} align="center" dim="heavy" zIndex={60}>
      <View
        style={{
          marginHorizontal: 16,
          marginTop: Math.max(insets.top, 12),
          marginBottom: Math.max(insets.bottom, 16),
          backgroundColor: THEME.surface,
          borderRadius: THEME.radius,
          padding: 16,
          ...themeShadow('card'),
        }}>
        <View className="flex-row items-center justify-end">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={onClose}
            style={{
              minHeight: 44,
              minWidth: 44,
              alignItems: 'center',
              justifyContent: 'center',
            }}>
            <AppText className="text-[15px] font-bold" style={{ color: THEME.textPrimary }}>
              Close
            </AppText>
          </Pressable>
        </View>
        {paid ? (
          <View className="items-center pb-2">
            <BlobMascot size={88} />
            <AppText className="mt-2 text-[22px] font-bold leading-7" style={{ color: THEME.textPrimary }}>
              You got paid.
            </AppText>
            <AppText className="mt-1 text-[15px] leading-6" style={{ color: THEME.textMuted }}>
              {name} · Prize
            </AppText>
          </View>
        ) : (
          <AppText className="text-[17px] font-semibold leading-6" style={{ color: THEME.textPrimary }}>
            {name} · Prize
          </AppText>
        )}
        <View className="mt-3">
          <SettlementSummary
            settlement={settlement}
            userId={userId}
            joined={joined}
            currency={challenge.currency}
            official={Boolean(challenge.is_official)}
            entryFeePaid={challenge.buy_in_amount}
            hostContribution={challenge.creator_contribution}
            prizePool={challenge.prize_pool}
          />
        </View>
        <View className="mt-4">
          <Button title="Close" size="lg" onPress={onClose} />
        </View>
      </View>
    </ChromeOverlay>
  );
}
