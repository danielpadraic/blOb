import { type ReactNode } from 'react';
import { Image } from 'expo-image';
import { Pressable, View } from 'react-native';

import { CurrencyMark, StakeAmount } from '@/components/currency/CurrencyMark';
import { Badge } from '@/components/ui/Badge';
import { AppText } from '@/components/ui/AppText';
import { isUnlimitedChallenge } from '@/lib/challenges';
import { joinedProgressCopy } from '@/lib/challengeRuleCopy';
import { CHALLENGE_TYPES } from '@/lib/constants';
import { THEME, themeShadow } from '@/lib/theme';
import type { ChallengeWithStats } from '@/lib/types';
import { lobbyDiscoverTimeLabel, lobbyDurationLabel, lobbyPlayersLabel, lobbyTimeLabel } from '@/utils/format';

type ChallengeCardProps = {
  challenge: ChallengeWithStats;
  onPress?: () => void;
  myDays?: number | null;
  variant?: 'discover' | 'rail';
  joined?: boolean;
  hosting?: boolean;
  invited?: boolean;
  onJoin?: () => void;
  friendCount?: number;
};

const cardShell = {
  backgroundColor: THEME.surface,
  borderColor: THEME.border,
  borderWidth: 1,
  borderRadius: THEME.radius,
  ...themeShadow('card'),
} as const;

function typeLabel(challenge: ChallengeWithStats) {
  const value = String(challenge.challenge_type ?? 'consistency');
  return CHALLENGE_TYPES.find((item) => item.value === value)?.label ?? 'Consistency';
}

function capLabel(challenge: ChallengeWithStats) {
  const max = Number(challenge.max_participants);
  if (!Number.isFinite(max) || max <= 0) {
    return 'Unlimited competitors';
  }
  return `Max ${max} competitors`;
}

function InfoTag({ label }: { label: string }) {
  return (
    <View
      style={{
        backgroundColor: THEME.background,
        borderWidth: 1,
        borderColor: THEME.border,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
      }}>
      <AppText className="text-[11px] font-medium text-charcoal">{label}</AppText>
    </View>
  );
}

function CardCta({
  title,
  onPress,
  variant = 'primary',
  flex,
}: {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  flex?: number;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={{
        height: 40,
        borderRadius: 12,
        backgroundColor: primary ? THEME.primary : THEME.surface,
        borderWidth: 1,
        borderColor: primary ? THEME.primary : THEME.border,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 12,
        ...(flex != null ? { flex } : {}),
      }}>
      <AppText
        className="text-[14px] font-semibold"
        style={{
          color: primary ? THEME.primaryForeground : THEME.primary,
          textAlign: 'center',
        }}>
        {title}
      </AppText>
    </Pressable>
  );
}

function MetaCol({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <View className="flex-1">
      <AppText className="text-[9px] font-semibold uppercase tracking-wide text-muted">
        {label}
      </AppText>
      <View className="mt-0.5">{children}</View>
    </View>
  );
}

export function ChallengeCard({
  challenge,
  onPress,
  myDays,
  variant = 'discover',
  joined = false,
  hosting = false,
  invited = false,
  onJoin,
  friendCount = 0,
}: ChallengeCardProps) {
  if (variant === 'rail') {
    return (
      <LobbyRailCard
        challenge={challenge}
        myDays={myDays}
        onPress={onPress}
        joined={joined}
        hosting={hosting}
        invited={invited}
      />
    );
  }

  const duration = lobbyDurationLabel(challenge);
  const type = typeLabel(challenge);
  const cap = capLabel(challenge);
  const friends = Math.max(Number(friendCount) || 0, 0);
  const startTime = lobbyDiscoverTimeLabel(challenge);

  return (
    <View style={[cardShell, { padding: 12, gap: 6 }]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={challenge.title}>
        <View className="flex-row items-start justify-between gap-2">
          <View className="min-w-0 flex-1 flex-row flex-wrap items-center gap-1">
            <Badge
              label={challenge.is_official ? 'Official' : 'Open'}
              tone={challenge.is_official ? 'charcoal' : 'coral'}
              className="px-1.5 py-0.5"
            />
            {challenge.frequency === 'weekly' ? (
              <Badge label="Weekly" tone="charcoal" className="px-1.5 py-0.5" />
            ) : null}
            {joined ? <Badge label="Joined" tone="mint" className="px-1.5 py-0.5" /> : null}
          </View>
          {friends > 0 ? (
            <View
              style={{
                borderRadius: 999,
                backgroundColor: THEME.accentSoft,
                paddingHorizontal: 8,
                paddingVertical: 3,
              }}>
              <AppText className="text-[11px] font-semibold text-charcoal">
                {friends} {friends === 1 ? 'friend' : 'friends'}
              </AppText>
            </View>
          ) : null}
        </View>

        {challenge.cover_image_url ? (
          <Image
            source={{ uri: challenge.cover_image_url }}
            style={{
              marginTop: 8,
              height: 96,
              width: '100%',
              borderRadius: THEME.radiusSm,
              backgroundColor: THEME.background,
            }}
            contentFit="cover"
            cachePolicy="memory-disk"
            accessibilityLabel={`${challenge.title} cover`}
          />
        ) : null}

        <AppText className="mt-1.5 text-[16px] font-extrabold leading-5 text-charcoal" numberOfLines={2}>
          {challenge.title}
        </AppText>

        <View className="mt-1.5 flex-row flex-wrap gap-1">
          <InfoTag label={duration} />
          <InfoTag label={type} />
          <InfoTag label={cap} />
          {startTime ? <InfoTag label={startTime} /> : null}
        </View>

        <View className="mt-1.5 flex-row items-start gap-2">
          <MetaCol label="Buy-in">
            <StakeAmount
              amount={challenge.buy_in_amount}
              currency={challenge.currency}
              size={13}
              freeLabel="Free"
              textClassName="text-[12px] font-semibold text-charcoal"
            />
          </MetaCol>
          <MetaCol label="Pool">
            <StakeAmount
              amount={challenge.prize_pool}
              currency={challenge.currency}
              size={13}
              zeroAsNumber
              textClassName="text-[12px] font-semibold text-charcoal"
            />
          </MetaCol>
          <MetaCol label="Competitors">
            <AppText className="text-[12px] font-semibold text-charcoal" numberOfLines={1}>
              {lobbyPlayersLabel(challenge)}
            </AppText>
          </MetaCol>
        </View>
      </Pressable>

      {joined && onPress ? (
        <CardCta title="Continue" onPress={onPress} />
      ) : (
        <View className="mt-0.5 flex-row items-center gap-2">
          {onPress ? (
            <CardCta title="View" onPress={onPress} variant="secondary" flex={1} />
          ) : null}
          {onJoin ? <CardCta title="Join" onPress={onJoin} flex={1.15} /> : null}
        </View>
      )}
    </View>
  );
}

function LobbyRailCard({
  challenge,
  myDays,
  onPress,
  joined = false,
  hosting = false,
  invited = false,
}: {
  challenge: ChallengeWithStats;
  myDays?: number | null;
  onPress?: () => void;
  joined?: boolean;
  hosting?: boolean;
  invited?: boolean;
}) {
  const unlimited = isUnlimitedChallenge(challenge);
  const hostOnly = hosting && !joined;
  const inviteOnly = invited && !joined && !hosting;
  const days = Math.max(Number(myDays) || 0, 0);
  const progressCopy = joinedProgressCopy(challenge, days);
  const buyIn = Number(challenge.buy_in_amount ?? 0);

  return (
    <View style={[cardShell, { width: 230, padding: 12, gap: 6 }]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={challenge.title}>
        <View className="flex-row flex-wrap items-center gap-1">
          <CurrencyMark currency={challenge.currency} size={14} />
          <Badge
            label={hostOnly ? 'Hosting' : inviteOnly ? 'Invited' : 'Joined'}
            tone={hostOnly ? 'charcoal' : inviteOnly ? 'coral' : 'mint'}
            className="px-1.5 py-0.5"
          />
          {challenge.is_official ? (
            <Badge label="Official" tone="charcoal" className="px-1.5 py-0.5" />
          ) : null}
        </View>
        <AppText className="mt-1 text-[15px] font-extrabold leading-5 text-charcoal" numberOfLines={2}>
          {challenge.title}
        </AppText>
        {challenge.cover_image_url ? (
          <Image
            source={{ uri: challenge.cover_image_url }}
            style={{
              marginTop: 6,
              height: 64,
              width: '100%',
              borderRadius: 8,
              backgroundColor: THEME.background,
            }}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : null}
        <View className="mt-1.5 flex-row flex-wrap gap-1">
          <InfoTag label={lobbyDurationLabel(challenge)} />
          <InfoTag label={typeLabel(challenge)} />
        </View>
        {buyIn > 0 ? (
          <View className="mt-1.5">
            <StakeAmount
              amount={buyIn}
              currency={challenge.currency}
              size={13}
              textClassName="text-[11px] font-semibold text-charcoal"
            />
          </View>
        ) : null}
        {hostOnly ? (
          <AppText className="mt-1 text-[11px] font-semibold text-muted">
            You’re hosting — not competing
          </AppText>
        ) : inviteOnly ? (
          <AppText className="mt-1 text-[11px] font-semibold text-muted">
            You’re invited — join to compete
          </AppText>
        ) : unlimited ? (
          <AppText className="mt-1 text-[11px] font-semibold text-muted">Still in</AppText>
        ) : (
          <View className="mt-1 gap-1">
            <AppText className="text-[11px] font-semibold text-charcoal">
              {progressCopy.label}
            </AppText>
            <View
              className="h-1 overflow-hidden rounded-full"
              style={{ backgroundColor: THEME.border }}>
              <View
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, progressCopy.ratio * 100)}%`,
                  backgroundColor: THEME.accent,
                }}
              />
            </View>
          </View>
        )}
        <AppText className="mt-1 text-[11px] font-semibold text-muted" numberOfLines={1}>
          {lobbyTimeLabel(challenge)}
        </AppText>
      </Pressable>
      {onPress ? (
        <CardCta title={hostOnly ? 'Manage' : inviteOnly ? 'View' : 'Continue'} onPress={onPress} />
      ) : null}
    </View>
  );
}
