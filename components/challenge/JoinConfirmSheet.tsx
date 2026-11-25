import { Image } from 'expo-image';
import { useMemo } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { ChromeOverlay } from '@/components/ui/ChromeOverlay';
import { AppText } from '@/components/ui/AppText';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import {
  allowedMissesLine,
  joinCtaLabel,
  joinPayLine,
  prizePoolLine,
  prizeSplitLine,
  refundBeforeStartLine,
  requiredProofLine,
  scoringRuleLine,
} from '@/lib/challenge/mechanics';
import {
  allowsSelfModeratorCheckbox,
  joinLaneHelper,
  joinLaneLabel,
  joinRoleReady,
  joinScoringLanes,
  usesJoinRoleSheet,
  type JoinRolePicks,
} from '@/lib/joinRole';
import { THEME, themeShadow } from '@/lib/theme';
import type { Challenge } from '@/lib/types';

type Props = {
  visible: boolean;
  challenge: Challenge;
  loading?: boolean;
  error?: string | null;
  picks: JoinRolePicks;
  onPicks: (next: JoinRolePicks) => void;
  onClose: () => void;
  onConfirm: () => void;
};

const DISMISS_Y = 88;

export function JoinConfirmSheet({
  visible,
  challenge,
  loading,
  error,
  picks,
  onPicks,
  onClose,
  onConfirm,
}: Props) {
  const insets = useSafeAreaInsets();
  const translateY = useSharedValue(0);
  const title = challengeDisplayTitle(challenge);
  const cover = String(challenge.cover_image_url ?? '').trim();
  const refund = refundBeforeStartLine(challenge);
  const roleSheet = usesJoinRoleSheet(challenge);
  const lanes = joinScoringLanes(challenge);
  const ready = !roleSheet || joinRoleReady(picks, challenge);
  const payLine = joinPayLine(challenge);

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

  return (
    <ChromeOverlay visible={visible} onClose={loading ? undefined : onClose} align="end" dim="heavy" fill>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, width: '100%', justifyContent: 'flex-end', backgroundColor: THEME.background }}>
        <GestureDetector gesture={handlePan}>
          <Animated.View
            style={[
              {
                backgroundColor: THEME.background,
                borderTopLeftRadius: THEME.radius,
                borderTopRightRadius: THEME.radius,
                maxHeight: '92%',
                paddingBottom: Math.max(insets.bottom, 16),
                ...themeShadow('card'),
              },
              sheetStyle,
            ]}>
            <View className="items-center pb-2 pt-2">
              <View className="h-1 w-10 rounded-full" style={{ backgroundColor: THEME.border }} />
            </View>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 12 }}>
              {cover ? (
                <Image
                  source={{ uri: cover }}
                  style={{ width: '100%', height: 140, borderRadius: 16, backgroundColor: THEME.surface }}
                  contentFit="cover"
                  accessibilityLabel=""
                />
              ) : null}
              <AppText className="mt-3 text-[22px] font-extrabold" style={{ color: THEME.textPrimary }}>
                {title}
              </AppText>
              <AppText className="mt-3 text-[26px] font-extrabold leading-8" style={{ color: THEME.textPrimary }}>
                {payLine}
              </AppText>
              <View
                className="mt-4"
                style={{
                  backgroundColor: THEME.surface,
                  borderRadius: THEME.radius,
                  borderWidth: 1,
                  borderColor: THEME.border,
                  padding: 14,
                  gap: 8,
                }}>
                <AppText className="text-[16px] font-bold" style={{ color: THEME.textPrimary }}>
                  {prizePoolLine(challenge)}
                </AppText>
                <AppText className="text-[14px] leading-5" style={{ color: THEME.textMuted }}>
                  {prizeSplitLine(challenge)}
                </AppText>
                {refund ? (
                  <AppText className="text-[14px] leading-5" style={{ color: THEME.textPrimary }}>
                    {refund}
                  </AppText>
                ) : null}
              </View>
              <AppText className="mt-4 text-[15px] leading-6" style={{ color: THEME.textPrimary }}>
                {allowedMissesLine(challenge)}
              </AppText>
              <AppText className="mt-3 text-[15px] leading-6" style={{ color: THEME.textPrimary }}>
                {requiredProofLine(challenge)}
              </AppText>
              <AppText className="mt-3 text-[15px] leading-6" style={{ color: THEME.textMuted }}>
                {scoringRuleLine(challenge)}
              </AppText>
              {roleSheet ? <RolePicks challenge={challenge} lanes={lanes} picks={picks} onPicks={onPicks} /> : null}
              {error ? (
                <AppText className="mt-3 text-[14px] leading-5" style={{ color: THEME.danger }}>
                  {error}
                </AppText>
              ) : null}
            </ScrollView>
            <View style={{ paddingHorizontal: 20, gap: 8 }}>
              <Button title={joinCtaLabel(challenge)} size="lg" loading={loading} disabled={!ready} onPress={onConfirm} />
              <Button title="Not now" variant="ghost" disabled={loading} onPress={onClose} />
            </View>
          </Animated.View>
        </GestureDetector>
      </KeyboardAvoidingView>
    </ChromeOverlay>
  );
}

function RolePicks({
  challenge,
  lanes,
  picks,
  onPicks,
}: {
  challenge: Challenge;
  lanes: ReturnType<typeof joinScoringLanes>;
  picks: JoinRolePicks;
  onPicks: (next: JoinRolePicks) => void;
}) {
  const help = joinLaneHelper(challenge);
  const selfMod = allowsSelfModeratorCheckbox(challenge);
  return (
    <View className="mt-4" style={{ gap: 8 }}>
      <AppText className="text-[12px] font-bold uppercase tracking-widest" style={{ color: THEME.textMuted }}>
        How you’ll be in the room
      </AppText>
      {(
        [
          { id: 'participant' as const, title: 'Participant', body: 'I compete. My numbers count.' },
          { id: 'observer' as const, title: 'Observer', body: 'I can watch. I don’t log or score.' },
        ] as const
      ).map((option) => {
        const on = picks.rosterRole === option.id;
        return (
          <Pressable
            key={option.id}
            onPress={() =>
              onPicks({
                ...picks,
                rosterRole: option.id,
                scoringLane: option.id === 'observer' ? null : picks.scoringLane,
              })
            }
            style={{
              borderRadius: THEME.radius,
              borderWidth: 1,
              borderColor: on ? THEME.accent : THEME.border,
              backgroundColor: on ? THEME.accentSoft : THEME.surface,
              padding: 12,
            }}>
            <AppText className="font-semibold" style={{ color: THEME.textPrimary }}>
              {option.title}
            </AppText>
            <AppText className="mt-1 text-[13px]" style={{ color: THEME.textMuted }}>
              {option.body}
            </AppText>
          </Pressable>
        );
      })}
      {picks.rosterRole === 'participant' && lanes.length > 0 ? (
        <View style={{ gap: 8 }}>
          {help ? (
            <AppText className="text-[13px]" style={{ color: THEME.textMuted }}>
              {help}
            </AppText>
          ) : null}
          {lanes.map((lane) => {
            const on = picks.scoringLane === lane.id;
            return (
              <Pressable
                key={lane.id}
                onPress={() => onPicks({ ...picks, scoringLane: lane.id })}
                style={{
                  borderRadius: THEME.radius,
                  borderWidth: 1,
                  borderColor: on ? THEME.accent : THEME.border,
                  padding: 12,
                  backgroundColor: THEME.surface,
                }}>
                <AppText className="font-semibold" style={{ color: THEME.textPrimary }}>
                  {joinLaneLabel(lane)}
                </AppText>
              </Pressable>
            );
          })}
        </View>
      ) : null}
      {selfMod ? (
        <Pressable onPress={() => onPicks({ ...picks, selfModerator: !picks.selfModerator })}>
          <AppText className="text-[14px] font-semibold" style={{ color: THEME.accent }}>
            {picks.selfModerator ? 'Moderator' : 'I’m a moderator'}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}
