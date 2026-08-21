import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { ChallengeTagRow } from '@/components/challenge/ChallengeTag';
import { FieldNoteLabel } from '@/components/challenge/FieldNote';
import { OfficialFillingStats } from '@/components/challenge/ChallengePosterCard';
import { ChallengeHeroOverflowButton } from '@/components/challenge/ChallengeDetailOverflow';
import { OfficialInviteButton } from '@/components/challenge/OfficialInviteButton';
import { ProofRequirementIcons } from '@/components/challenge/ProofRequirementIcons';
import { BlobMascot } from '@/components/mascot/BlobMascot';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { CurrencyMark } from '@/components/currency/CurrencyMark';
import { AppText } from '@/components/ui/AppText';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { challengeGoalSubtitle } from '@/lib/challengeGoal';
import { challengeCardTags } from '@/lib/challengeTags';
import { formatCash, isBucksChallenge } from '@/lib/currency';
import { isOfficialJoinable } from '@/lib/officialSeries';
import { themeShadow } from '@/lib/theme';
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
  const filling = isOfficialJoinable(challenge);
  const tags = challengeCardTags({
    challenge,
    hosting: Boolean(hosting && viewerId && viewerId === challenge.created_by),
    joined,
    invited,
    showNotJoined: showNotJoined && !joined,
  });
  const subtitle = challengeGoalSubtitle(challenge);
  const pool = Number(challenge.prize_pool) || 0;
  const bucks = isBucksChallenge(challenge);

  const summary = (
    <View className="gap-3">
      <ChallengeTagRow tags={tags} />
      <AppText
        className="text-[24px] font-extrabold leading-7"
        style={{ color: '#fff' }}
        numberOfLines={2}>
        {challenge.title}
      </AppText>
      {official ? (
        <View className="flex-row items-center" style={{ gap: 8, minHeight: 28, flexWrap: 'nowrap' }}>
          <AppText
            className="text-[13px] font-semibold"
            numberOfLines={1}
            style={{ color: 'rgba(255,255,255,0.86)' }}>
            Sponsored by
          </AppText>
          <BlobMascot variant="logo" size={72} />
        </View>
      ) : null}
      {host && !official ? (
        <ProfileLink username={host.username} userId={host.id}>
          <AppText className="text-[13px]" style={{ color: 'rgba(255,255,255,0.78)' }}>
            Hosted by{' '}
            <AppText className="font-semibold" style={{ color: '#fff' }}>
              {host.display_name ?? host.username}
            </AppText>
          </AppText>
        </ProfileLink>
      ) : null}
      <ProofRequirementIcons challenge={challenge} tint="light" />
      {cancelled ? (
        <AppText className="text-[15px] font-semibold" style={{ color: '#fff' }}>
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
                labelClassName="text-[16px] font-extrabold text-white"
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
                style={{ color: 'rgba(255,255,255,0.62)', letterSpacing: 0.2 }}>
                Goal
              </AppText>
              <AppText className="mt-1 text-[15px] font-bold" style={{ color: '#fff' }} numberOfLines={1}>
                {goalLabel}
              </AppText>
              {subtitle ? (
                <AppText
                  className="mt-0.5 text-[11px]"
                  style={{ color: 'rgba(255,255,255,0.72)' }}
                  numberOfLines={1}>
                  {subtitle}
                </AppText>
              ) : null}
            </View>
          )}
          <OfficialFillingStats
            challenge={challenge}
            nowMs={nowMs}
            showStartLine={filling}
            tone="hero"
          />
        </View>
      ) : (
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            <FieldNoteLabel
              note="pot"
              tint="light"
              numberOfLines={1}
              textClassName="text-[11px] font-semibold uppercase"
              textStyle={{ color: 'rgba(255,255,255,0.62)', letterSpacing: 0.2 }}>
              Prize
            </FieldNoteLabel>
            <View className="mt-1 flex-row items-center" style={{ gap: 6, minWidth: 0 }}>
              {bucks ? (
                <AppText
                  className="text-[22px] font-extrabold"
                  style={{ color: '#fff' }}
                  numberOfLines={1}>
                  {formatCash(pool)}
                </AppText>
              ) : (
                <>
                  <CurrencyMark currency="coins" size={22} />
                  <AppText
                    className="text-[22px] font-extrabold"
                    style={{ color: '#fff' }}
                    numberOfLines={1}>
                    {pool.toFixed(2)}
                  </AppText>
                </>
              )}
            </View>
          </View>
          {showProgressRing && joined ? (
            <View className="items-center">
              <ProgressRing
                progress={progressRatio}
                size={72}
                strokeWidth={7}
                label={`${daysCompleted}`}
                labelClassName="text-[16px] font-extrabold text-white"
                color="#72D9CB"
              />
              <AppText
                className="mt-1 text-center text-[12px] font-semibold"
                style={{ color: '#fff' }}
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
                style={{ color: 'rgba(255,255,255,0.62)', letterSpacing: 0.2 }}>
                Goal
              </AppText>
              <AppText
                className="mt-1 text-right text-[15px] font-bold"
                style={{ color: '#fff' }}
                numberOfLines={1}>
                {goalLabel}
              </AppText>
              {subtitle ? (
                <AppText
                  className="mt-0.5 text-right text-[11px]"
                  style={{ color: 'rgba(255,255,255,0.72)' }}
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
      colors={['#2C9B89', '#10201D']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        borderRadius: 24,
        overflow: 'hidden',
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
            opacity: 0.18,
            borderRadius: 24,
          }}
          contentFit="cover"
          cachePolicy="memory-disk"
          accessibilityLabel={`${challenge.title} cover`}
        />
      ) : null}
      <View className="gap-3 p-4">
        <View className="flex-row items-start">
          <View className="min-w-0 flex-1">
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
          </View>
          <ChallengeHeroOverflowButton />
        </View>
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
