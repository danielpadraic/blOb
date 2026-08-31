import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { ChallengeCardClock, ChallengeScheduleMeta } from '@/components/challenge/ChallengeScheduleMeta';
import { LobbyEntryPrizeRow } from '@/components/challenge/LobbyEntryPrizeRow';
import { ChallengeTagRow } from '@/components/challenge/ChallengeTag';
import { OfficialFillingStats } from '@/components/challenge/ChallengePosterCard';
import { OfficialSponsorLine } from '@/components/challenge/OfficialSponsorLine';
import { ChallengeHeroOverflowButton } from '@/components/challenge/ChallengeDetailOverflow';
import { OfficialInviteButton } from '@/components/challenge/OfficialInviteButton';
import { ProofRequirementIcons } from '@/components/challenge/ProofRequirementIcons';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { AppText } from '@/components/ui/AppText';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { challengeGoalSubtitle } from '@/lib/challengeGoal';
import { challengeCardTags } from '@/lib/challengeTags';
import { isOfficialJoinable } from '@/lib/officialSeries';
import { challengeDisplayTitle } from '@/lib/challengeTitle';
import { THEME, themeShadow } from '@/lib/theme';
import type { ChallengeWithStats } from '@/lib/types';

type HeroHost = {
  id: string;
  username: string;
  display_name?: string | null;
} | null;

type ChallengeHeroCardProps = {
  challenge: ChallengeWithStats;
  host?: HeroHost;
  viewerId?: string | null;
  joined?: boolean;
  hosting?: boolean;
  invited?: boolean;
  showNotJoined?: boolean;
  goalLabel: string;
  daysCompleted?: number;
  progressRatio?: number;
  nowMs: number;
  showProgressRing?: boolean;
  cancelled?: boolean;
  onOpen?: () => void;
  onInvite?: () => void;
  children?: ReactNode;
};

const OFFICIAL_HERO = ['#1B5A50', '#123832', '#0E2421'] as const;
const USER_HERO = ['#FFFFFF', '#F7F7F5'] as const;

export function ChallengeHeroCard({
  challenge,
  host,
  viewerId,
  joined = false,
  hosting = false,
  invited = false,
  showNotJoined = false,
  goalLabel,
  daysCompleted = 0,
  progressRatio = 0,
  nowMs,
  showProgressRing = false,
  cancelled = false,
  onOpen,
  onInvite,
  children,
}: ChallengeHeroCardProps) {
  const official = Boolean(challenge.is_official);
  const filling = official && isOfficialJoinable(challenge);
  const tags = challengeCardTags({
    challenge,
    hosting: Boolean(hosting && viewerId && viewerId === challenge.created_by),
    joined,
    invited,
    showNotJoined: showNotJoined && !joined,
  });
  const subtitle = challengeGoalSubtitle(challenge);
  const titleColor = official ? '#FFFFFF' : THEME.textPrimary;
  const muted = official ? 'rgba(255,255,255,0.78)' : THEME.textMuted;
  const labelMuted = official ? 'rgba(255,255,255,0.62)' : THEME.textMuted;
  const ringLabel = official
    ? 'text-[16px] font-extrabold text-white'
    : 'text-[16px] font-extrabold text-charcoal';
  const hostName = host?.display_name?.trim() || host?.username || '';

  const summary = (
    <View className="gap-3">
      <View className="flex-row items-start">
        <View className="min-w-0 flex-1">
          <ChallengeTagRow tags={tags} tone={official ? 'dark' : 'light'} />
          <AppText
            className="mt-2 text-[24px] font-extrabold leading-7"
            style={{ color: titleColor }}
            numberOfLines={1}>
            {challengeDisplayTitle(challenge)}
          </AppText>
        </View>
        <View style={{ alignItems: 'flex-end', marginLeft: 8 }}>
          <ChallengeCardClock challenge={challenge} nowMs={nowMs} overlay light={official} />
          <ChallengeHeroOverflowButton light={official} />
        </View>
      </View>
      <ChallengeScheduleMeta
        challenge={challenge}
        nowMs={nowMs}
        tone={official ? 'dark' : 'light'}
        hideClock
      />
      {official ? (
        <OfficialSponsorLine
          challenge={challenge}
          muted={muted}
          titleColor={titleColor}
        />
      ) : null}
      {host ? (
        <ProfileLink username={host.username} userId={host.id}>
          <AppText className="text-[13px]" style={{ color: muted }}>
            Hosted by{' '}
            <AppText className="font-semibold" style={{ color: official ? titleColor : THEME.textPrimary }}>
              {hostName}
            </AppText>
          </AppText>
        </ProfileLink>
      ) : null}
      <ProofRequirementIcons challenge={challenge} tint={official ? 'light' : 'dark'} />
      {cancelled ? (
        <AppText className="text-[15px] font-semibold" style={{ color: titleColor }}>
          Cancelled
        </AppText>
      ) : null}
      {cancelled ? null : official ? (
        <View className="gap-3">
          {showProgressRing && joined ? (
            <View className="flex-row items-center justify-end">
              <ProgressRing
                progress={progressRatio}
                size={72}
                strokeWidth={7}
                label={`${daysCompleted}`}
                labelClassName={ringLabel}
                color="#72D9CB"
              />
            </View>
          ) : (
            <View>
              <AppText
                className="text-[11px] font-semibold uppercase"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={{ color: labelMuted, letterSpacing: 0.2 }}>
                Goal
              </AppText>
              <AppText className="mt-1 text-[15px] font-bold" style={{ color: titleColor }} numberOfLines={1}>
                {goalLabel}
              </AppText>
              {subtitle ? (
                <AppText className="mt-0.5 text-[11px]" style={{ color: muted }} numberOfLines={1}>
                  {subtitle}
                </AppText>
              ) : null}
            </View>
          )}
          <OfficialFillingStats
            challenge={challenge}
            nowMs={nowMs}
            showStartLine={false}
            tone="hero"
          />
        </View>
      ) : (
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <LobbyEntryPrizeRow challenge={challenge} color={titleColor} />
          </View>
          {showProgressRing && joined ? (
            <View className="items-center">
              <ProgressRing
                progress={progressRatio}
                size={72}
                strokeWidth={7}
                label={`${daysCompleted}`}
                labelClassName={ringLabel}
                color={THEME.accent}
              />
              <AppText
                className="mt-1 text-center text-[12px] font-semibold"
                style={{ color: titleColor }}
                numberOfLines={1}>
                {goalLabel}
              </AppText>
            </View>
          ) : (
            <View className="max-w-[42%] items-end">
              <AppText
                className="text-[11px] font-semibold uppercase"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.8}
                style={{ color: labelMuted, letterSpacing: 0.2 }}>
                Goal
              </AppText>
              <AppText
                className="mt-1 text-right text-[15px] font-bold"
                style={{ color: titleColor }}
                numberOfLines={1}>
                {goalLabel}
              </AppText>
              {subtitle ? (
                <AppText
                  className="mt-0.5 text-right text-[11px]"
                  style={{ color: muted }}
                  numberOfLines={1}>
                  {subtitle}
                </AppText>
              ) : null}
            </View>
          )}
        </View>
      )}
    </View>
  );

  return (
    <LinearGradient
      colors={[...(official ? OFFICIAL_HERO : USER_HERO)]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: 24,
        overflow: 'hidden',
        borderWidth: official ? 0 : 1,
        borderColor: THEME.border,
        ...themeShadow('card'),
      }}>
      {challenge.cover_image_url ? (
        <Image
          source={{ uri: challenge.cover_image_url }}
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            left: 0,
            opacity: official ? 0.18 : 0.1,
            borderRadius: 24,
          }}
          contentFit="cover"
          cachePolicy="memory-disk"
          accessibilityLabel={`${challenge.title} cover`}
        />
      ) : null}
      <View className="gap-3 p-4">
        {onOpen ? (
          <Pressable
            onPress={onOpen}
            accessibilityRole="button"
            accessibilityLabel={challenge.title}>
            {summary}
          </Pressable>
        ) : (
          summary
        )}
        {filling ? (
          <OfficialInviteButton
            challengeId={challenge.id}
            challengeTitle={challenge.title}
            tone="hero"
            onOpenPicker={onInvite}
          />
        ) : null}
        {children}
      </View>
    </LinearGradient>
  );
}
