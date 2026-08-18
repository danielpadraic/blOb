import { Pressable, View } from 'react-native';

import { StakeAmount } from '@/components/currency/CurrencyMark';
import { AppText } from '@/components/ui/AppText';
import { isLiveCompetitorStatus, isPointsChallenge } from '@/lib/challenges';
import { joinedProgressCopy } from '@/lib/challengeRuleCopy';
import { isBucksChallenge, isSponsoredBucks } from '@/lib/currency';
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
  const days = Math.max(Number(daysCompleted) || 0, 0);
  const competing = joined;
  const dropped = competing && !isLiveCompetitorStatus(participantStatus);
  const progressCopy = competing ? joinedProgressCopy(challenge, days) : null;
  const remaining = remainingFromChallenge(challenge);
  const points = isPointsChallenge(challenge);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={challenge.title}
      style={{
        width: POSTER_WIDTH,
        height: POSTER_HEIGHT,
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
          <Tag label={visibilityLabel(challenge.visibility)} />
          <Tag label={isBucksChallenge(challenge) ? 'Bucks' : 'Coins'} />
          <Tag label={points ? 'Points' : 'Consistency'} />
        </View>
        <AppText
          className="mt-2 text-[15px] font-extrabold leading-5 text-charcoal"
          numberOfLines={2}>
          {challenge.title}
        </AppText>
      </View>

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
            {lobbyTimeLabel(challenge)}
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
