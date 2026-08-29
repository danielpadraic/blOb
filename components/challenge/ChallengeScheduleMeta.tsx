import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import {
  challengeScheduleState,
  type ScheduleChallenge,
} from '@/lib/lobbyChallenge';
import { THEME } from '@/lib/theme';

export function ChallengeScheduleMeta({
  challenge,
  nowMs,
  compact = false,
  tone = 'light',
}: {
  challenge: ScheduleChallenge;
  nowMs?: number;
  compact?: boolean;
  tone?: 'light' | 'dark';
}) {
  const state = challengeScheduleState(challenge, nowMs);
  if (!state.datetime && !state.chip && !state.gate && !state.countdown) {
    return null;
  }
  const dateColor = tone === 'dark' ? '#FFFFFF' : THEME.textPrimary;
  const muted = tone === 'dark' ? 'rgba(255,255,255,0.78)' : THEME.textMuted;
  const clockColor = state.urgent ? THEME.danger : dateColor;
  return (
    <View style={{ gap: compact ? 4 : 6, minWidth: 0 }}>
      {state.datetime ? (
        <AppText
          className={compact ? 'text-[12px] font-semibold' : 'text-[14px] font-extrabold'}
          style={{ color: dateColor }}
          numberOfLines={1}>
          {state.datetime}
        </AppText>
      ) : null}
      {state.countdown ? (
        <AppText
          className={compact ? 'text-[12px] font-extrabold' : 'text-[16px] font-extrabold'}
          style={{ color: clockColor, fontVariant: ['tabular-nums'] }}
          numberOfLines={1}>
          {state.countdown}
        </AppText>
      ) : null}
      {state.chip ? (
        <View
          style={{
            alignSelf: 'flex-start',
            backgroundColor: THEME.accentSoft,
            borderRadius: 999,
            paddingHorizontal: compact ? 8 : 10,
            paddingVertical: compact ? 2 : 3,
          }}>
          <AppText
            className={compact ? 'text-[11px] font-semibold' : 'text-[12px] font-semibold'}
            style={{ color: THEME.accent, fontVariant: ['tabular-nums'] }}
            numberOfLines={1}>
            {state.chip}
          </AppText>
        </View>
      ) : null}
      {state.gate ? (
        <AppText
          className={compact ? 'text-[11px] font-semibold' : 'text-[13px] font-semibold'}
          style={{ color: muted }}
          numberOfLines={1}>
          {state.gate}
        </AppText>
      ) : null}
    </View>
  );
}
