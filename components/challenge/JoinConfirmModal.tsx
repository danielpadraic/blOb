import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { requiredProofTypes, isPointsChallenge, isUnlimitedChallenge, lastManStandingRequirement, prizeStructureSummary } from '@/lib/challenges';
import { challengeRuleCopy } from '@/lib/challengeRuleCopy';
import { proofMeta } from '@/lib/constants';
import type { Challenge } from '@/lib/types';
import { THEME } from '@/lib/theme';
import { formatWallet, formatWalletWithUsd, isBucksChallenge } from '@/lib/currency';
import { formatUsd } from '@/utils/format';

type JoinConfirmModalProps = {
  visible: boolean;
  challenge: Challenge;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: () => void;
};

function acknowledgments(challenge: Challenge) {
  const buyInAmount = Math.max(Number(challenge.buy_in_amount) || 0, 0);
  const bucks = isBucksChallenge(challenge);
  const buyIn = bucks ? formatWalletWithUsd(buyInAmount, 'bucks') : formatWallet(buyInAmount, 'coins');
  const isFree = buyInAmount <= 0;
  const proofs = requiredProofTypes(challenge);
  const proofLabels = proofs.map((type) => proofMeta(type).label).join(', ');
  const points = isPointsChallenge(challenge);
  const unlimited = isUnlimitedChallenge(challenge);
  const ruleCopy = challengeRuleCopy(challenge);

  const prizeCopy = prizeStructureSummary(challenge);

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
              `Each log needs: ${proofLabels}. No honor system.`,
            ]
              .filter(Boolean)
              .join('\n'),
    },
    ...(bucks
      ? [
          {
            id: 'irreversible',
            title: 'This cannot be reversed',
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
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const buyInAmount = Math.max(Number(challenge.buy_in_amount) || 0, 0);
  const bucks = isBucksChallenge(challenge);
  const buyIn = bucks ? formatWalletWithUsd(buyInAmount, 'bucks') : formatWallet(buyInAmount, 'coins');
  const isFree = buyInAmount <= 0;
  const items = acknowledgments(challenge);
  const allChecked = items.every((item) => checked[item.id]);

  useEffect(() => {
    if (!visible) {
      setChecked({});
    }
  }, [visible]);

  function toggle(id: string) {
    setChecked((current) => ({ ...current, [id]: !current[id] }));
  }

  function close() {
    if (loading) {
      return;
    }
    onClose();
  }

  return (
    <ChromeOverlay visible={visible} onClose={close}>
      <Pressable
        className="max-h-[92%] px-5 pb-10 pt-6"
        style={{
          backgroundColor: THEME.background,
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
              title={isFree ? 'Confirm and join free' : `Confirm and pay ${buyIn}`}
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
