import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { JoinCtaButton } from '@/components/challenge/JoinCtaButton';
import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { requiredChallengeProofs, isPointsChallenge, isUnlimitedChallenge, lastManStandingRequirement, prizeStructureSummary } from '@/lib/challenges';
import { proofDisplayName, usesWeek10ProofSentence, WEEK_10_PROOF_SENTENCE } from '@/lib/challengeProofs';
import { challengeRuleCopy } from '@/lib/challengeRuleCopy';
import type { Challenge } from '@/lib/types';
import { THEME } from '@/lib/theme';
import { formatCash, formatWalletNumber, isBucksChallenge, walletBalance } from '@/lib/currency';
import { bucksJoinCta } from '@/lib/joinCta';
import { copy } from '@/lib/copy';
import { officialDetailsParagraphs } from '@/copy/officialBob';
import { officialCashJoinBlock } from '@/lib/officialCash';
import { officialDobStatus } from '@/lib/officialDob';
import { useMyProfile } from '@/hooks/useProfile';
import {
  allowsSelfModeratorCheckbox,
  emptyJoinRolePicks,
  joinLaneHelper,
  joinLaneLabel,
  joinRoleReady,
  joinScoringLanes,
  usesJoinRoleSheet,
  type JoinRolePicks,
} from '@/lib/joinRole';

type JoinConfirmModalProps = {
  visible: boolean;
  challenge: Challenge;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (picks?: JoinRolePicks) => void;
};

const DISMISS_Y = 88;

function acknowledgments(challenge: Challenge) {
  const buyInAmount = Math.max(Number(challenge.buy_in_amount) || 0, 0);
  const bucks = isBucksChallenge(challenge);
  const buyIn = bucks ? formatCash(buyInAmount) : formatWalletNumber(buyInAmount);
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
          : 'The entry fee leaves your wallet now',
      body: isFree
        ? bucks
          ? 'Confirming does not take money from your wallet. This official challenge still pays the prize in $ (1:1 with USD).'
          : 'Confirming does not take anything from your wallet. The prize is already funded.'
        : bucks
          ? `${buyIn} leaves now and goes into the prize. Leave before this Skill Tournament goes live and it comes back in full. Once live, the entry fee is committed.`
          : `${buyIn} leaves now and goes into the prize. Leave before live and it comes back in full. Once live, the entry fee is committed.`,
    },
    {
      id: 'split',
      title: unlimited ? 'Last person standing wins everything' : 'How the prize is paid out',
      body: unlimited
        ? `${lastManStandingRequirement(challenge)} The last remaining eligible person takes the entire prize.`
        : prizeCopy,
    },
    {
      id: 'proofs',
      title: points
        ? challenge.tasks.some((task) => task.proof_required)
          ? 'Some tasks need proof'
          : 'Check in your progress'
        : unlimited
          ? 'Miss the requirement and you’re out'
          : proofs.length === 1
            ? 'Proof is required'
            : `${proofs.length} proofs, every check-in`,
      body: points
        ? challenge.tasks.some((task) => task.proof_required)
          ? `When you check in, attach: ${proofLabels}. Task-by-task tracking comes next — for now it’s a simple daily check-in.`
          : 'For now you check in with a short note. Task-by-task checkoff comes next.'
        : unlimited
          ? [
              ruleCopy.primary,
              ...ruleCopy.extras,
              `Every check-in needs: ${proofLabels}. Stay eligible until only one person remains.`,
            ]
              .filter(Boolean)
              .join('\n')
          : honorOnly
            ? 'Honor. Confirm to check in.'
            : usesWeek10ProofSentence(challenge)
              ? WEEK_10_PROOF_SENTENCE
              : [
                  ruleCopy.primary,
                  ...ruleCopy.extras,
                  `Each check-in needs: ${proofLabels}.`,
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
              : `${buyIn} leaves now. Full refund if you leave before live. Once live, the entry fee is committed.`,
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
  const [picks, setPicks] = useState<JoinRolePicks>(emptyJoinRolePicks);
  const buyInAmount = Math.max(Number(challenge.buy_in_amount) || 0, 0);
  const bucks = isBucksChallenge(challenge);
  const buyIn = bucks ? formatCash(buyInAmount) : formatWalletNumber(buyInAmount);
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
  // The sheet should never open for a shut cash Official — this is the backstop
  // if one is ever presented directly.
  const cashBlock = officialCashJoinBlock({
    challenge,
    dobStatus: officialDobStatus(profile?.date_of_birth),
    declaredRegion: profile?.declared_region,
  });
  const cashBlocked = cashBlock.blocked;
  const cashBlockedCopy = cashBlock.blocked ? cashBlock.copy : '';
  const confirmTitle = official && cta.needsTopUp && !cashBlocked
    ? cta.topUpLabel
    : isFree
      ? 'Confirm and join free'
      : null;
  const payEntry = !isFree && !(official && cta.needsTopUp && !cashBlocked);

  useEffect(() => {
    if (!visible) {
      setChecked({});
      setPicks(emptyJoinRolePicks());
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

  const roleSheet = usesJoinRoleSheet(challenge);
  const lanes = joinScoringLanes(challenge);
  const showSides = picks.rosterRole === 'participant' && lanes.length > 0;
  const selfModOk = allowsSelfModeratorCheckbox(challenge);
  const roleReady = joinRoleReady(picks, challenge);
  const laneHelp = joinLaneHelper(challenge);

  if (roleSheet) {
    return (
      <ChromeOverlay visible={visible} onClose={close} dim="heavy">
        <GestureDetector gesture={handlePan}>
          <Animated.View style={[sheetChrome, sheetStyle]}>
            <View className="items-center pb-3 pt-2" accessibilityRole="adjustable" accessibilityLabel="Dismiss">
              <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
            </View>
            <AppText className="text-2xl font-bold text-charcoal">Join this challenge</AppText>

            <AppText className="mt-5 text-[11px] font-semibold uppercase tracking-widest text-muted">
              How you’ll be in the room
            </AppText>
            <View className="mt-2 gap-2">
              {(
                [
                  {
                    id: 'participant' as const,
                    title: 'Participant',
                    body: 'I compete. My numbers count.',
                  },
                  {
                    id: 'observer' as const,
                    title: 'Observer',
                    body: 'I can watch Live and the Board. I don’t log or score.',
                  },
                ] as const
              ).map((option) => {
                const on = picks.rosterRole === option.id;
                return (
                  <Pressable
                    key={option.id}
                    onPress={() =>
                      setPicks((current) => ({
                        ...current,
                        rosterRole: option.id,
                        scoringLane: option.id === 'observer' ? null : current.scoringLane,
                      }))
                    }
                    className="rounded-blob border px-4 py-3"
                    style={{
                      backgroundColor: on ? THEME.accentSoft : THEME.surface,
                      borderColor: on ? THEME.accent : THEME.line,
                      borderWidth: 1.5,
                      borderRadius: THEME.radius,
                    }}>
                    <AppText className="font-semibold text-charcoal">{option.title}</AppText>
                    <AppText className="mt-1 text-sm leading-5 text-muted">{option.body}</AppText>
                  </Pressable>
                );
              })}
            </View>

            {showSides ? (
              <View className="mt-5">
                <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                  Side
                </AppText>
                {laneHelp ? (
                  <AppText className="mt-1 text-sm leading-5 text-muted">{laneHelp}</AppText>
                ) : null}
                <View className="mt-2 gap-2">
                  {lanes.map((lane) => {
                    const on = picks.scoringLane === lane.id;
                    return (
                      <Pressable
                        key={lane.id}
                        onPress={() => setPicks((current) => ({ ...current, scoringLane: lane.id }))}
                        className="rounded-blob border px-4 py-3"
                        style={{
                          backgroundColor: on ? THEME.accentSoft : THEME.surface,
                          borderColor: on ? THEME.accent : THEME.line,
                          borderWidth: 1.5,
                          borderRadius: THEME.radius,
                        }}>
                        <AppText className="font-semibold text-charcoal">{joinLaneLabel(lane)}</AppText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {selfModOk ? (
              <Pressable
                onPress={() =>
                  setPicks((current) => ({ ...current, selfModerator: !current.selfModerator }))
                }
                className="mt-5 flex-row items-start gap-3 rounded-blob border px-4 py-3"
                style={{
                  backgroundColor: THEME.surface,
                  borderColor: picks.selfModerator ? THEME.primary : THEME.line,
                  borderWidth: 1.5,
                  borderRadius: THEME.radius,
                }}>
                <View
                  className="mt-0.5 h-5 w-5 items-center justify-center rounded-md border"
                  style={{
                    backgroundColor: picks.selfModerator ? THEME.primary : THEME.background,
                    borderColor: picks.selfModerator ? THEME.primary : THEME.line,
                  }}>
                  {picks.selfModerator ? (
                    <AppText className="text-[11px] font-bold" style={{ color: THEME.primaryForeground }}>
                      ✓
                    </AppText>
                  ) : null}
                </View>
                <View className="flex-1">
                  <AppText className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                    Help run it
                  </AppText>
                  <AppText className="mt-1 font-semibold text-charcoal">I’m a moderator</AppText>
                </View>
              </Pressable>
            ) : null}

            {error ? (
              <AppText className="mt-4 text-sm leading-5 text-coral-dark">{error}</AppText>
            ) : null}
            <View className="mt-6 gap-3">
              {payEntry ? (
                <JoinCtaButton
                  verb="Participate"
                  size="lg"
                  currency={challenge.currency}
                  amount={buyInAmount}
                  loading={loading}
                  disabled={!roleReady}
                  onPress={() => onConfirm(picks)}
                />
              ) : (
                <Button
                  title={isFree ? 'Participate free' : 'Join'}
                  size="lg"
                  loading={loading}
                  disabled={!roleReady}
                  onPress={() => onConfirm(picks)}
                />
              )}
              <Button title="Not now" variant="ghost" onPress={close} disabled={loading} />
            </View>
          </Animated.View>
        </GestureDetector>
      </ChromeOverlay>
    );
  }

  if (official) {
    return (
      <ChromeOverlay visible={visible} onClose={close} dim="heavy">
        <GestureDetector gesture={handlePan}>
          <Animated.View style={[sheetChrome, { minHeight: '70%' }, sheetStyle]}>
            <View className="items-center pb-3 pt-2" accessibilityRole="adjustable" accessibilityLabel="Dismiss">
              <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
            </View>
            <AppText className="text-2xl font-bold text-charcoal">
              {isFree || !bucks ? 'Join this challenge?' : `Join for ${buyIn}?`}
            </AppText>
            <ScrollView
              style={{ flexGrow: 0, maxHeight: 360 }}
              showsVerticalScrollIndicator={false}>
              {officialDetailsParagraphs(challenge).map((paragraph) => (
                <AppText key={paragraph} className="mt-3 text-[15px] leading-6 text-charcoal">
                  {paragraph}
                </AppText>
              ))}
            </ScrollView>
            {error ? (
              <AppText className="mt-4 text-sm leading-5 text-coral-dark">{error}</AppText>
            ) : null}
            {cashBlockedCopy ? (
              <AppText className="mt-4 text-sm leading-5" style={{ color: THEME.textMuted }}>
                {cashBlockedCopy}
              </AppText>
            ) : null}
            <View className="mt-6 gap-3">
              {payEntry ? (
                <JoinCtaButton
                  verb="Participate"
                  size="lg"
                  currency={challenge.currency}
                  amount={buyInAmount}
                  loading={loading}
                  disabled={cashBlocked}
                  onPress={cashBlocked ? () => {} : onConfirm}
                />
              ) : (
                <Button
                  title={confirmTitle ?? 'Confirm and join free'}
                  size="lg"
                  loading={loading}
                  disabled={cashBlocked}
                  onPress={cashBlocked ? () => {} : onConfirm}
                />
              )}
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
            {isFree ? 'Participate in this Skill Tournament?' : `Participate ${buyIn}?`}
          </AppText>
          <AppText className="mt-2 text-muted">
            {bucks
              ? isFree
                ? 'This Skill Tournament pays real money. Check every box. 1:1 with USD.'
                : `Check every box. ${buyIn} leaves now. Full refund if you leave before live.`
              : isFree
                ? 'Check all three. Participating is free and does not take anything from your wallet.'
                : 'Check all three. The entry fee leaves now. Full refund if you leave before live.'}
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
            {payEntry ? (
              <JoinCtaButton
                verb="Participate"
                size="lg"
                currency={challenge.currency}
                amount={buyInAmount}
                loading={loading}
                disabled={!allChecked}
                onPress={onConfirm}
              />
            ) : (
              <Button
                title={confirmTitle ?? 'Confirm and join free'}
                size="lg"
                loading={loading}
                disabled={!allChecked}
                onPress={onConfirm}
              />
            )}
            <Button title="Not now" variant="ghost" onPress={close} disabled={loading} />
          </View>
      </Pressable>
    </ChromeOverlay>
  );
}
