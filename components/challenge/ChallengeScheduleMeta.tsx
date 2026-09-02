import { View } from 'react-native';

import { AppText } from '@/components/ui/AppText';
import { Glyph, GLYPH } from '@/components/ui/Glyph';
import {
  challengeScheduleState,
  endedDatetimeLine,
  lobbyCardClock,
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
  chipOnly = false,
}: {
  challenge: ScheduleChallenge;
  nowMs?: number;
  compact?: boolean;
  tone?: 'light' | 'dark';
  forceEnded?: boolean;
  hideClock?: boolean;
  /** Relative chip only — never also print Starts Tomorrow 9:00 AM. */
  chipOnly?: boolean;
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
  const showClock = !chipOnly && !hideClock && Boolean(state.datetime || state.countdown);
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
  overlay = false,
  light = false,
}: {
  challenge: ScheduleChallenge;
  nowMs?: number;
  forceEnded?: boolean;
  overlay?: boolean;
  light?: boolean;
}) {
  const clock = lobbyCardClock(challenge, nowMs, forceEnded);
  if (!clock) {
    return null;
  }
  const muted = light ? 'rgba(255,255,255,0.86)' : THEME.textMuted;
  return (
    <View
      style={{
        alignItems: 'flex-end',
        flexGrow: 0,
        flexShrink: 0,
        maxWidth: overlay ? undefined : 148,
      }}>
      {clock.lines.map((line) => (
        <AppText
          key={line}
          className={clock.urgent ? 'font-semibold' : undefined}
          style={{
            color: clock.urgent ? THEME.danger : muted,
            fontSize: 10,
            lineHeight: 13,
            textAlign: 'right',
            fontVariant: line.startsWith('Ends in') ? ['tabular-nums'] : undefined,
          }}>
          {line}
        </AppText>
      ))}
    </View>
  );
}
