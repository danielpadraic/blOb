import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { requiredChallengeProofs, isPointsChallenge, isUnlimitedChallenge, lastManStandingRequirement, prizeStructureSummary } from '@/lib/challenges';
import { proofDisplayName } from '@/lib/challengeProofs';
import { challengeRuleCopy } from '@/lib/challengeRuleCopy';
import type { Challenge } from '@/lib/types';
import { THEME } from '@/lib/theme';
import { formatCash, formatWallet, isBucksChallenge, walletBalance } from '@/lib/currency';
import { bucksJoinCta } from '@/lib/joinCta';
import { formatUsd } from '@/utils/format';
import { copy } from '@/lib/copy';
import { officialBob } from '@/copy/officialBob';
import { useMyProfile } from '@/hooks/useProfile';

type JoinConfirmModalProps = {
  visible: boolean;
  challenge: Challenge;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

const DISMISS_Y = 88;

function acknowledgments(challenge: Challenge) {
  const buyInAmount = Math.max(Number(challenge.buy_in_amount) || 0, 0);
  const bucks = isBucksChallenge(challenge);
  const buyIn = bucks ? formatCash(buyInAmount) : formatWallet(buyInAmount, 'coins');
  const isFree = buyInAmount <= 0;
  const proofs = requiredChallengeProofs(challenge);
  const proofLabels = proofs.map((proof) => proofDisplayName(proof)).join(', ');
  const honorOnly = proofs.length > 0 && proofs.every((proof) => proof.method === 'honor');
  const points = isPointsChallenge(challenge);
  const unlimited = isUnlimitedChallenge(challenge);
  const ruleCopy = challengeRuleCopy(challenge);

  const prizeCopy = prizeStructureSummary(challenge);
  if (challenge.is_official) {
    return [];
  }

  return [
    {
      id: 'buyin',
      title: isFree
        ? bucks
          ? 'Joining is free — prize is real money'
          : 'Joining is free'
        : bucks
          ? 'Real money leaves your wallet now'
          : 'The buy-in leaves your wallet now',
      body: isFree
        ? bucks
          ? 'Confirming does not take Bucks from your wallet. This official challenge still pays the prize in Bucks (1 Buck = $1 USD).'
          : 'Confirming does not take Coins from your wallet. The prize pool is already funded.'
        : bucks
          ? `${buyIn} will be deducted immediately. 1 Buck = ${formatUsd(1)}. This cannot be reversed.`
          : `${buyIn} will be taken from your Coins the moment you confirm. If you don’t finish, you do not get it back.`,
    },
    {
      id: 'split',
      title: unlimited ? 'Last person standing wins everything' : 'How the prize pool is paid out',
      body: unlimited
        ? `${lastManStandingRequirement(challenge)} The last remaining eligible person takes the entire prize pool.`
        : prizeCopy,
    },
    {
      id: 'proofs',
      title: points
        ? challenge.tasks.some((task) => task.proof_required)
          ? 'Some tasks need proof'
          : 'Log your progress'
        : unlimited
          ? 'Miss the requirement and you’re out'
          : proofs.length === 1
            ? 'Proof is required'
            : `${proofs.length} proofs, every log`,
      body: points
        ? challenge.tasks.some((task) => task.proof_required)
          ? `When you log, attach: ${proofLabels}. Task-by-task logging comes next — for now it’s a simple daily log.`
          : 'For now you log progress with a short note. Task-by-task checkoff comes next.'
        : unlimited
          ? [
              ruleCopy.primary,
              ...ruleCopy.extras,
              `Every log needs: ${proofLabels}. Stay eligible until only one person remains.`,
            ]
              .filter(Boolean)
              .join('\n')
          : [
              ruleCopy.primary,
              ...ruleCopy.extras,
              honorOnly
                ? 'Honor. Confirm to log.'
                : `Each log needs: ${proofLabels}. ${copy('create.proofsHelper')}`,
            ]
              .filter(Boolean)
              .join('\n'),
    },
    ...(bucks
      ? [
          {
            id: 'irreversible',
            title: copy('money.irreversible'),
            body: isFree
              ? 'The prize is still real money. Results and payouts cannot be undone.'
              : `${buyIn} is deducted immediately. There is no refund.`,
          },
        ]
      : []),
  ];
}

export function JoinConfirmModal({
  visible,
  challenge,
  loading,
  error,
  onClose,
  onConfirm,
}: JoinConfirmModalProps) {
  const insets = useSafeAreaInsets();
  const { profile } = useMyProfile();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const buyInAmount = Math.max(Number(challenge.buy_in_amount) || 0, 0);
  const bucks = isBucksChallenge(challenge);
  const buyIn = bucks ? formatCash(buyInAmount) : formatWallet(buyInAmount, 'coins');
  const isFree = buyInAmount <= 0;
  const items = acknowledgments(challenge);
  const allChecked = items.length === 0 || items.every((item) => checked[item.id]);
  const translateY = useSharedValue(0);
  const cta = bucksJoinCta({
    currency: challenge.currency,
    buyIn: buyInAmount,
    wallet: walletBalance(profile, challenge.currency),
    hasProfile: Boolean(profile),
  });
  const official = Boolean(challenge.is_official);
  const confirmTitle = official
    ? cta.needsTopUp
      ? cta.topUpLabel
      : isFree
        ? 'Confirm and join free'
        : `Confirm and pay ${buyIn}`
    : isFree
      ? 'Confirm and join free'
      : `Confirm and pay ${buyIn}`;

  useEffect(() => {
    if (!visible) {
      setChecked({});
      translateY.value = 0;
    }
  }, [translateY, visible]);

  function toggle(id: string) {
    setChecked((current) => ({ ...current, [id]: !current[id] }));
  }

  function close() {
    if (loading) {
      return;
    }
    onClose();
  }

  const handlePan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(8)
        .failOffsetX([-24, 24])
        .onUpdate((event) => {
          translateY.value = Math.max(0, event.translationY);
        })
        .onEnd((event) => {
          if (loading) {
            translateY.value = withTiming(0, { duration: 180 });
            return;
          }
          if (event.translationY > DISMISS_Y || event.velocityY > 900) {
            runOnJS(onClose)();
            return;
          }
          translateY.value = withTiming(0, { duration: 180 });
        }),
    [loading, onClose, translateY],
  );

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const sheetChrome = {
    backgroundColor: THEME.surface,
    borderTopLeftRadius: THEME.radiusLg,
    borderTopRightRadius: THEME.radiusLg,
    width: '100%' as const,
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: Math.max(insets.bottom, 16) + 8,
  };

  if (official) {
    return (
      <ChromeOverlay visible={visible} onClose={close} dim="heavy">
        <GestureDetector gesture={handlePan}>
          <Animated.View style={[sheetChrome, { minHeight: '70%' }, sheetStyle]}>
            <View className="items-center pb-3 pt-2" accessibilityRole="adjustable" accessibilityLabel="Dismiss">
              <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
            </View>
            <AppText className="text-2xl font-bold text-charcoal">
              {isFree ? 'Join this challenge?' : `Join for ${buyIn}?`}
            </AppText>
            <AppText className="mt-3 text-[15px] leading-6 text-muted">{officialBob('joinBob')}</AppText>
            <AppText className="mt-3 text-[13px] leading-5 text-muted">{officialBob('legalAge')}</AppText>
            {error ? (
              <AppText className="mt-4 text-sm leading-5 text-coral-dark">{error}</AppText>
            ) : null}
            <View className="mt-6 gap-3">
              <Button title={confirmTitle} size="lg" loading={loading} onPress={onConfirm} />
              <Button title="Not now." variant="ghost" onPress={close} disabled={loading} />
            </View>
          </Animated.View>
        </GestureDetector>
      </ChromeOverlay>
    );
  }

  return (
    <ChromeOverlay visible={visible} onClose={close}>
      <Pressable
        className="max-h-[92%] px-5 pb-10 pt-6"
        style={{
          backgroundColor: THEME.surface,
          borderTopLeftRadius: THEME.radiusLg,
          borderTopRightRadius: THEME.radiusLg,
        }}
        onPress={(event) => event.stopPropagation()}>
          <AppText className="text-2xl font-bold text-charcoal">
            {isFree ? 'Join this challenge?' : `Join for ${buyIn}?`}
          </AppText>
          <AppText className="mt-2 text-muted">
            {bucks
              ? isFree
                ? 'This official challenge pays real money. Check every box. 1 Buck = $1 USD.'
                : `Check every box. ${buyIn} leaves immediately. This cannot be reversed.`
              : isFree
                ? 'Check all three. Joining is free and does not take Coins from your wallet.'
                : 'Check all three. Coins leave your wallet the moment you confirm. There is no undo.'}
          </AppText>

          <ScrollView className="mt-5" showsVerticalScrollIndicator={false}>
            <View className="gap-3">
            {items.map((item) => {
              const isOn = Boolean(checked[item.id]);
              return (
                <Pressable
                  key={item.id}
                  onPress={() => toggle(item.id)}
                  className="rounded-blob border px-4 py-3"
                  style={{
                    backgroundColor: THEME.surface,
                    borderColor: isOn ? THEME.primary : THEME.border,
                    borderWidth: 1.5,
                    borderRadius: THEME.radius,
                  }}>
                  <View className="flex-row items-start gap-3">
                    <View
                      className="mt-0.5 h-5 w-5 items-center justify-center rounded-md border"
                      style={{
                        backgroundColor: isOn ? THEME.primary : THEME.background,
                        borderColor: isOn ? THEME.primary : THEME.border,
                      }}>
                      {isOn ? (
                        <AppText
                          className="text-[11px] font-bold"
                          style={{ color: THEME.primaryForeground }}>
                          ✓
                        </AppText>
                      ) : null}
                    </View>
                    <View className="flex-1">
                      <AppText className="font-semibold text-charcoal">{item.title}</AppText>
                      <AppText className="mt-1 text-sm leading-5 text-muted">
                        {item.body}
                      </AppText>
                    </View>
                  </View>
                </Pressable>
              );
            })}
            </View>
          </ScrollView>

          <View className="mt-6 gap-3">
            {error ? (
              <AppText className="text-sm leading-5 text-coral-dark">{error}</AppText>
            ) : null}
            <Button
              title={confirmTitle}
              size="lg"
              loading={loading}
              disabled={!allChecked}
              onPress={onConfirm}
            />
            <Button title="Not now" variant="ghost" onPress={close} disabled={loading} />
          </View>
      </Pressable>
    </ChromeOverlay>
  );
}
