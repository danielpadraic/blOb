import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { StakeAmount } from '@/components/currency/CurrencyMark';
import { AppText } from '@/components/ui/AppText';
import { isLiveCompetitorStatus, isPointsChallenge } from '@/lib/challenges';
import { joinedProgressCopy } from '@/lib/challengeRuleCopy';
import { copy } from '@/lib/copy';
import { formatWallet, isBucksChallenge, isSponsoredBucks } from '@/lib/currency';
import {
  armingCountdownLabel,
  isOfficialJoinable,
  officialToStartAmount,
} from '@/lib/officialSeries';
import { THEME, themeShadow } from '@/lib/theme';
import type { ChallengeWithStats } from '@/lib/types';
import { lobbyTimeLabel } from '@/utils/format';

export const POSTER_WIDTH = 250;
export const POSTER_HEIGHT = 188;
export const POSTER_RADIUS = 25;
const OFFICIAL_POSTER_HEIGHT = 228;

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
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!officialJoinable || challenge.status !== 'arming') {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [officialJoinable, challenge.status]);

  const days = Math.max(Number(daysCompleted) || 0, 0);
  const competing = joined;
  const dropped = competing && !isLiveCompetitorStatus(participantStatus);
  const progressCopy = competing ? joinedProgressCopy(challenge, days) : null;
  const remaining = remainingFromChallenge(challenge);
  const points = isPointsChallenge(challenge);
  const guarantee = Math.max(Number(challenge.host_budget ?? challenge.creator_contribution) || 0, 0);
  const timeLabel =
    officialJoinable && challenge.status === 'arming'
      ? armingCountdownLabel(challenge.armed_at, new Date(nowMs)) ?? ''
      : lobbyTimeLabel(challenge);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={challenge.title}
      style={{
        width: POSTER_WIDTH,
        height: officialJoinable ? OFFICIAL_POSTER_HEIGHT : POSTER_HEIGHT,
        backgroundColor: THEME.surface,
        borderColor: THEME.border,
        borderWidth: 1,
        borderRadius: POSTER_RADIUS,
        padding: 12,
        justifyContent: 'space-between',
        ...themeShadow('card'),
      }}>
      <View>
        <View className="flex-row flex-wrap items-center" style={{ gap: 4 }}>
          {challenge.is_official ? (
            <Tag label={isSponsoredBucks(challenge) ? 'Sponsored' : 'Official'} dark />
          ) : null}
          {competing ? <Tag label="Joined" mint /> : null}
          {hosting && !joined ? <Tag label="Hosting" dark /> : null}
          {invited && !joined && !hosting ? <Tag label="Invited" mint /> : null}
          {officialJoinable ? null : <Tag label={visibilityLabel(challenge.visibility)} />}
          <Tag label={isBucksChallenge(challenge) ? 'Bucks' : 'Coins'} />
          {officialJoinable ? null : <Tag label={points ? 'Points' : 'Consistency'} />}
        </View>
        <AppText
          className="mt-2 text-[15px] font-extrabold leading-5 text-charcoal"
          numberOfLines={2}>
          {challenge.title}
        </AppText>
      </View>

      {officialJoinable ? (
        <View>
          {timeLabel ? (
            <AppText className="mb-2 text-[11px] font-semibold text-charcoal" numberOfLines={1}>
              {timeLabel}
            </AppText>
          ) : null}
          <View className="flex-row flex-wrap" style={{ gap: 8 }}>
            <PosterStat
              label={copy('create.buyIn')}
              value={formatWallet(challenge.buy_in_amount, challenge.currency)}
            />
            <PosterStat label={copy('board.guarantee')} value={formatWallet(guarantee, challenge.currency)} />
            <PosterStat
              label={copy('board.pot')}
              value={formatWallet(challenge.prize_pool, challenge.currency)}
            />
            <PosterStat
              label={copy('board.toStart')}
              value={formatWallet(officialToStartAmount(guarantee), challenge.currency)}
            />
          </View>
        </View>
      ) : (
        <View>
          <View className="flex-row items-center justify-between gap-2">
            <StakeAmount
              amount={challenge.buy_in_amount}
              currency={challenge.currency}
              size={13}
              freeLabel={isSponsoredBucks(challenge) ? 'Free · $' : 'Free'}
              textClassName="text-[12px] font-semibold text-charcoal"
            />
            <AppText className="shrink text-[11px] text-muted" numberOfLines={1}>
              {timeLabel}
            </AppText>
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
        </View>
      )}
    </Pressable>
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

function PosterStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '47%' }}>
      <AppText className="text-[9px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </AppText>
      <AppText className="mt-0.5 text-[12px] font-extrabold text-charcoal" numberOfLines={1}>
        {value}
      </AppText>
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
