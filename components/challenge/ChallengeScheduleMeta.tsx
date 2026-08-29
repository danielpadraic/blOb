import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import {
  challengeScheduleState,
  endedDatetimeLine,
  type ScheduleChallenge,
} from '@/lib/lobbyChallenge';
import { THEME } from '@/lib/theme';

export function ChallengeScheduleMeta({
  challenge,
  nowMs,
  compact = false,
  tone = 'light',
  forceEnded = false,
  hideClock = false,
}: {
  challenge: ScheduleChallenge;
  nowMs?: number;
  compact?: boolean;
  tone?: 'light' | 'dark';
  forceEnded?: boolean;
  hideClock?: boolean;
}) {
  const live = challengeScheduleState(challenge, nowMs);
  const state = forceEnded
    ? {
        ...live,
        datetime: endedDatetimeLine(challenge.ends_at, challenge.distributed_at),
        chip: null,
        gate: null,
        countdown: null,
        urgent: false,
      }
    : live;
  const showClock = !hideClock && Boolean(state.datetime || state.countdown);
  if (!showClock && !state.chip && !state.gate) {
    return null;
  }
  const dateColor = tone === 'dark' ? '#FFFFFF' : THEME.textPrimary;
  const muted = tone === 'dark' ? 'rgba(255,255,255,0.78)' : THEME.textMuted;
  const clockColor = state.urgent ? THEME.danger : dateColor;
  return (
    <View style={{ gap: compact ? 4 : 6, minWidth: 0 }}>
      {showClock && state.datetime ? (
        <AppText
          className={compact ? 'text-[11px]' : 'text-[14px] font-extrabold'}
          style={{ color: compact ? muted : dateColor }}
          numberOfLines={1}>
          {state.datetime}
        </AppText>
      ) : null}
      {showClock && state.countdown ? (
        <AppText
          className={compact ? 'text-[11px] font-semibold' : 'text-[16px] font-extrabold'}
          style={{ color: state.urgent ? THEME.danger : clockColor, fontVariant: ['tabular-nums'] }}
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
        <View className="flex-row items-center" style={{ gap: 4, minWidth: 0 }}>
          <Glyph name={GLYPH.people} color={muted} size={compact ? 12 : 14} />
          <AppText
            className={compact ? 'text-[11px]' : 'text-[13px] font-semibold'}
            style={{ color: muted }}
            numberOfLines={1}>
            {state.gate}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

export function ChallengeCardClock({
  challenge,
  nowMs,
  forceEnded = false,
}: {
  challenge: ScheduleChallenge;
  nowMs?: number;
  forceEnded?: boolean;
}) {
  const live = challengeScheduleState(challenge, nowMs);
  const datetime = forceEnded
    ? endedDatetimeLine(challenge.ends_at, challenge.distributed_at)
    : live.datetime;
  const countdown = forceEnded ? null : live.countdown;
  const urgent = !forceEnded && live.urgent;
  if (!datetime && !countdown) {
    return null;
  }
  return (
    <View style={{ alignItems: 'flex-end', flexShrink: 0, maxWidth: 132 }}>
      {datetime ? (
        <AppText className="text-[11px]" style={{ color: THEME.textMuted }} numberOfLines={1}>
          {datetime}
        </AppText>
      ) : null}
      {countdown ? (
        <AppText
          className="text-[11px] font-semibold"
          style={{ color: urgent ? THEME.danger : THEME.textMuted, fontVariant: ['tabular-nums'] }}
          numberOfLines={1}>
          {countdown}
        </AppText>
      ) : null}
    </View>
  );
}
