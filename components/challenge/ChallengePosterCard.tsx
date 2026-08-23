import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ChallengeCardVisual } from '@/components/challenge/ChallengeCardVisual';
import { FieldNoteLabel } from '@/components/challenge/FieldNote';
import { ChallengeTagRow } from '@/components/challenge/ChallengeTag';
import { BuckUsdAmount, StakeAmount } from '@/components/currency/CurrencyMark';
import { AppText } from '@/components/ui/AppText';
import { isLiveCompetitorStatus, isPointsChallenge } from '@/lib/challenges';
import { joinedProgressCopy } from '@/lib/challengeRuleCopy';
import { challengeCardTags } from '@/lib/challengeTags';
import { copy } from '@/lib/copy';
import {
  armingCountdownLabel,
  isOfficialJoinable,
  isOfficialSeriesChallenge,
  officialContestantsNeeded,
  officialStartNeededLabel,
} from '@/lib/officialSeries';
import { THEME, themeShadow } from '@/lib/theme';
import type { ChallengeWithStats } from '@/lib/types';
import { lobbyTimeLabel } from '@/utils/format';

export const POSTER_WIDTH = 250;
export const POSTER_HEIGHT = 188;
export const POSTER_RADIUS = 25;

type ChallengePosterCardProps = {
  challenge: ChallengeWithStats;
  onPress?: () => void;
  joined?: boolean;
  hosting?: boolean;
  invited?: boolean;
  daysCompleted?: number | null;
  participantStatus?: string | null;
};

export function remainingFromChallenge(challenge: ChallengeWithStats): number {
  const eligible = Number(challenge.eligible_count);
  if (challenge.eligible_count != null && Number.isFinite(eligible) && eligible >= 0) {
    return eligible;
  }
  return Math.max(Number(challenge.participant_count) || 0, 0);
}

export function ChallengePosterCard({
  challenge,
  onPress,
  joined = false,
  hosting = false,
  invited = false,
  daysCompleted = 0,
  participantStatus,
}: ChallengePosterCardProps) {
  const officialJoinable = isOfficialJoinable(challenge);
  const officialLive = isOfficialSeriesChallenge(challenge) && challenge.status === 'live';
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if ((!officialJoinable || challenge.status !== 'arming') && !officialLive) {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [officialJoinable, officialLive, challenge.status]);

  const days = Math.max(Number(daysCompleted) || 0, 0);
  const competing = joined;
  const dropped = competing && !isLiveCompetitorStatus(participantStatus);
  const progressCopy = competing ? joinedProgressCopy(challenge, days) : null;
  const remaining = remainingFromChallenge(challenge);
  const points = isPointsChallenge(challenge);
  const timeLabel =
    officialJoinable && challenge.status === 'arming'
      ? armingCountdownLabel(challenge.armed_at, new Date(nowMs)) ?? ''
      : lobbyTimeLabel(challenge);

  const cardStyle = {
    width: POSTER_WIDTH,
    height: POSTER_HEIGHT,
    backgroundColor: THEME.surface,
    borderColor: THEME.border,
    borderWidth: 1,
    borderRadius: POSTER_RADIUS,
    padding: 12,
    justifyContent: 'space-between' as const,
    ...themeShadow('card'),
  };

  const header = (
    <View>
      <ChallengeTagRow
        tags={challengeCardTags({
          challenge,
          hosting: hosting && !joined,
          joined: competing,
          invited: invited && !joined && !hosting,
        })}
      />
      <AppText
        className="mt-2 text-[15px] font-extrabold leading-5 text-charcoal"
        numberOfLines={2}
        adjustsFontSizeToFit
        minimumFontScale={0.85}>
        {challenge.title}
      </AppText>
    </View>
  );

  if (officialJoinable || officialLive || challenge.is_official) {
    return (
      <ChallengeCardVisual
        challenge={challenge}
        joined={competing}
        hosting={hosting}
        invited={invited}
        myDays={days}
        nowMs={nowMs}
        onPress={onPress}
        showOfficialShare
      />
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={challenge.title}
      style={cardStyle}>
      {header}
          <View className="flex-row items-center justify-between gap-2">
            <StakeAmount
              amount={challenge.buy_in_amount}
              currency={challenge.currency}
              size={13}
              freeLabel="Free"
              textClassName="text-[12px] font-semibold text-charcoal"
            />
            {officialLive ? null : (
              <AppText className="shrink text-[11px] text-muted" numberOfLines={1}>
                {timeLabel}
              </AppText>
            )}
            {competing ? (
              <AppText className="text-[11px] font-semibold text-charcoal" numberOfLines={1}>
                {points ? progressCopy?.label ?? `${days} tasks` : `${days} check-in${days === 1 ? '' : 's'}`}
              </AppText>
            ) : null}
          </View>
          {competing && progressCopy ? (
            <View
              className="mt-2 h-[3px] overflow-hidden rounded-full"
              style={{ backgroundColor: THEME.border }}>
              <View
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(0, progressCopy.ratio) * 100)}%`,
                  backgroundColor: THEME.accent,
                }}
              />
            </View>
          ) : (
            <View className="mt-2 h-[3px]" />
          )}
          <View
            className="mt-2 justify-center px-2.5"
            style={{
              minHeight: 22,
              borderRadius: 999,
              backgroundColor: remaining <= 0 && !competing ? THEME.surface2 : THEME.accentSoft,
            }}>
            <AppText
              className="text-[11px] font-semibold"
              style={{ color: THEME.textPrimary }}
              numberOfLines={1}>
              {posterStatus({ competing, dropped, logs: days, remaining })}
            </AppText>
          </View>
    </Pressable>
  );
}

export function OfficialFillingStats({
  challenge,
  nowMs,
  showStartLine = true,
  tone = 'card',
}: {
  challenge: ChallengeWithStats;
  nowMs: number;
  showStartLine?: boolean;
  tone?: 'card' | 'hero';
}) {
  const guarantee = Math.max(Number(challenge.host_budget ?? challenge.creator_contribution) || 0, 0);
  const pot = Math.max(Number(challenge.prize_pool) || 0, 0);
  const buyIn = Math.max(Number(challenge.buy_in_amount) || 0, 0);
  const needed = officialContestantsNeeded({ guarantee, pot, buyIn });
  const startLine = !showStartLine
    ? null
    : needed > 0
      ? officialStartNeededLabel(needed)
      : challenge.status === 'arming'
        ? armingCountdownLabel(challenge.armed_at, new Date(nowMs))
        : null;
  const hero = tone === 'hero';
  const amountClass = hero
    ? 'text-[12px] font-extrabold'
    : 'text-[12px] font-extrabold text-charcoal';
  const amountColor = hero ? '#fff' : undefined;
  const labelColor = hero ? 'rgba(255,255,255,0.62)' : undefined;

  return (
    <View>
      <View className="flex-row" style={{ gap: 8 }}>
        <PosterStat
          label={copy('create.buyIn')}
          value={<BuckUsdAmount amount={buyIn} textClassName={amountClass} color={amountColor} />}
          labelColor={labelColor}
          note="buyIn"
          tint={hero ? 'light' : 'dark'}
        />
        <PosterStat
          label={copy('board.guarantee')}
          value={<BuckUsdAmount amount={guarantee} textClassName={amountClass} color={amountColor} />}
          labelColor={labelColor}
        />
        <PosterStat
          label={copy('board.pot')}
          value={<BuckUsdAmount amount={pot} textClassName={amountClass} color={amountColor} />}
          labelColor={labelColor}
          note="pot"
          tint={hero ? 'light' : 'dark'}
        />
      </View>
      {startLine ? (
        <View className="mt-1 flex-row items-start" style={{ gap: 6 }}>
          <FieldNoteLabel
            note="startNeeded"
            tint={hero ? 'light' : 'dark'}
            textClassName="text-[11px] font-semibold uppercase"
            textStyle={{ color: hero ? 'rgba(255,255,255,0.62)' : THEME.textMuted, letterSpacing: 0.2 }}>
            Start
          </FieldNoteLabel>
          <AppText
            className="min-w-0 flex-1 text-[11px] leading-4"
            style={{ color: hero ? 'rgba(255,255,255,0.78)' : THEME.textMuted }}
            numberOfLines={2}>
            {startLine}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

function posterStatus({
  competing,
  dropped,
  logs,
  remaining,
}: {
  competing: boolean;
  dropped: boolean;
  logs: number;
  remaining: number;
}) {
  if (competing) {
    return `You · ${logs} check-in${logs === 1 ? '' : 's'} · ${dropped ? 'dropped' : 'still in'}`;
  }
  if (remaining <= 0) {
    return 'Settled';
  }
  return `${remaining} remaining · tap to view`;
}

function PosterStat({
  label,
  value,
  labelColor,
  note,
  tint = 'dark',
}: {
  label: string;
  value: ReactNode;
  labelColor?: string;
  note?: 'pot' | 'buyIn';
  tint?: 'light' | 'dark';
}) {
  const labelStyle = { color: labelColor ?? THEME.textMuted, letterSpacing: 0.2 };
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      {note ? (
        <FieldNoteLabel
          note={note}
          tint={tint}
          numberOfLines={1}
          textClassName="text-[9px] font-semibold uppercase"
          textStyle={labelStyle}>
          {label}
        </FieldNoteLabel>
      ) : (
        <AppText
          className="text-[9px] font-semibold uppercase"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.75}
          style={labelStyle}>
          {label}
        </AppText>
      )}
      {typeof value === 'string' ? (
        <AppText className="mt-0.5 text-[12px] font-extrabold text-charcoal" numberOfLines={1}>
          {value}
        </AppText>
      ) : (
        <View className="mt-0.5">{value}</View>
      )}
    </View>
  );
}
