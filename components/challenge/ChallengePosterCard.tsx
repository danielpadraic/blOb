import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { OfficialDayClock } from '@/components/challenge/OfficialDayClock';
import { OfficialInviteButton } from '@/components/challenge/OfficialInviteButton';
import { BuckUsdAmount, StakeAmount } from '@/components/currency/CurrencyMark';
import { AppText } from '@/components/ui/AppText';
import { isLiveCompetitorStatus, isPointsChallenge } from '@/lib/challenges';
import { joinedProgressCopy } from '@/lib/challengeRuleCopy';
import { copy } from '@/lib/copy';
import { isBucksChallenge, isSponsoredBucks } from '@/lib/currency';
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
const OFFICIAL_POSTER_HEIGHT = 292;

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
    height: officialJoinable || officialLive ? OFFICIAL_POSTER_HEIGHT : POSTER_HEIGHT,
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
      <View className="flex-row flex-wrap items-center" style={{ gap: 4 }}>
        {challenge.is_official ? (
          <Tag label={isSponsoredBucks(challenge) ? 'Sponsored' : 'Official'} dark />
        ) : null}
        {competing ? <Tag label="Joined" mint /> : null}
        {hosting && !joined ? <Tag label="Hosting" dark /> : null}
        {invited && !joined && !hosting ? <Tag label="Invited" mint /> : null}
        {officialJoinable ? null : <Tag label={visibilityLabel(challenge.visibility)} />}
        {officialJoinable ? null : <Tag label={isBucksChallenge(challenge) ? 'Bucks' : 'Coins'} />}
        {officialJoinable ? null : <Tag label={points ? 'Points' : 'Consistency'} />}
      </View>
      <AppText
        className="mt-2 text-[15px] font-extrabold leading-5 text-charcoal"
        numberOfLines={2}>
        {challenge.title}
      </AppText>
    </View>
  );

  if (officialJoinable) {
    return (
      <View style={cardStyle}>
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={challenge.title}>
          {header}
          <OfficialFillingStats challenge={challenge} nowMs={nowMs} />
        </Pressable>
        <OfficialInviteButton challengeId={challenge.id} challengeTitle={challenge.title} />
      </View>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={challenge.title}
      style={cardStyle}>
      {header}
          {officialLive ? (
            <View className="mb-2">
              <OfficialDayClock challenge={challenge} now={new Date(nowMs)} variant="card" />
            </View>
          ) : null}
          <View className="flex-row items-center justify-between gap-2">
            <StakeAmount
              amount={challenge.buy_in_amount}
              currency={challenge.currency}
              size={13}
              freeLabel={isSponsoredBucks(challenge) ? 'Free · $' : 'Free'}
              textClassName="text-[12px] font-semibold text-charcoal"
            />
            {officialLive ? null : (
              <AppText className="shrink text-[11px] text-muted" numberOfLines={1}>
                {timeLabel}
              </AppText>
            )}
            {competing ? (
              <AppText className="text-[11px] font-semibold text-charcoal" numberOfLines={1}>
                {points ? progressCopy?.label ?? `${days} tasks` : `${days} log${days === 1 ? '' : 's'}`}
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
}: {
  challenge: ChallengeWithStats;
  nowMs: number;
  showStartLine?: boolean;
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

  return (
    <View>
      <View className="flex-row flex-wrap" style={{ gap: 8 }}>
        <PosterStat label={copy('create.buyIn')} value={<BuckUsdAmount amount={buyIn} />} />
        <PosterStat label={copy('board.guarantee')} value={<BuckUsdAmount amount={guarantee} />} />
        <PosterStat label={copy('board.pot')} value={<BuckUsdAmount amount={pot} />} />
      </View>
      {startLine ? (
        <AppText className="mt-2 text-[11px] leading-4 text-muted" numberOfLines={2}>
          {startLine}
        </AppText>
      ) : null}
    </View>
  );
}

function visibilityLabel(value: string | null | undefined) {
  const visibility = String(value ?? 'public').toLowerCase();
  if (visibility === 'private' || visibility === 'invite') {
    return 'Private';
  }
  return 'Public';
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
    return `You · ${logs} log${logs === 1 ? '' : 's'} · ${dropped ? 'dropped' : 'still in'}`;
  }
  if (remaining <= 0) {
    return 'No one remaining';
  }
  return `${remaining} remaining · tap to view`;
}

function PosterStat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={{ width: '47%' }}>
      <AppText className="text-[9px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </AppText>
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

function Tag({
  label,
  dark,
  mint,
}: {
  label: string;
  dark?: boolean;
  mint?: boolean;
}) {
  return (
    <View
      className="self-start rounded-full"
      style={{
        backgroundColor: dark ? THEME.primary : mint ? THEME.accentSoft : THEME.surface2,
        paddingHorizontal: 7,
        paddingVertical: 3,
      }}>
      <AppText
        className="text-[9px] font-extrabold uppercase"
        style={{
          color: dark ? THEME.primaryForeground : mint ? THEME.accent : THEME.textMuted,
          letterSpacing: 0.4,
          lineHeight: 11,
        }}>
        {label}
      </AppText>
    </View>
  );
}
