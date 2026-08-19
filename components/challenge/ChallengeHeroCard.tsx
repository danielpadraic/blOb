import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';

import { ChallengeTagRow } from '@/components/challenge/ChallengeTag';
import { OfficialFillingStats } from '@/components/challenge/ChallengePosterCard';
import { OfficialInviteButton } from '@/components/challenge/OfficialInviteButton';
import { ProofRequirementIcons } from '@/components/challenge/ProofRequirementIcons';
import { BlobMascot } from '@/components/mascot/BlobMascot';
import { ProfileLink } from '@/components/profile/ProfileLink';
import { AppText } from '@/components/ui/AppText';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { challengeGoalSubtitle } from '@/lib/challengeGoal';
import { challengeCardTags } from '@/lib/challengeTags';
import { formatCash, formatWallet, isBucksChallenge } from '@/lib/currency';
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
  const poolLabel = isBucksChallenge(challenge) ? formatCash(pool) : formatWallet(pool, challenge.currency);

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
        <View className="flex-row items-center" style={{ minHeight: 28 }}>
          <BlobMascot variant="logo" size={92} />
        </View>
      ) : host ? (
        <ProfileLink username={host.username} userId={host.id}>
          <AppText className="text-[13px]" style={{ color: 'rgba(255,255,255,0.78)' }}>
            Hosted by{' '}
            <AppText className="font-semibold" style={{ color: '#fff' }}>
              {host.display_name ?? host.username}
            </AppText>
          </AppText>
        </ProfileLink>
      ) : null}
      {official ? <ProofRequirementIcons challenge={challenge} tint="light" /> : null}
      {cancelled ? (
        <AppText className="text-[15px] font-semibold" style={{ color: '#fff' }}>
          Cancelled
        </AppText>
      ) : null}
      {cancelled ? null : (
        <View className="flex-row items-start justify-between gap-3">
          <View className="min-w-0 flex-1">
            {official ? (
              <OfficialFillingStats
                challenge={challenge}
                nowMs={nowMs}
                showStartLine={filling}
                tone="hero"
              />
            ) : (
              <View>
                <AppText
                  className="text-[11px] font-semibold uppercase"
                  style={{ color: 'rgba(255,255,255,0.62)', letterSpacing: 0.6 }}>
                  Current pool
                </AppText>
                <AppText className="mt-1 text-[22px] font-extrabold" style={{ color: '#fff' }}>
                  {poolLabel}
                </AppText>
              </View>
            )}
          </View>
          {showProgressRing && joined ? (
            <View className="items-center">
              <ProgressRing
                progress={progressRatio}
                size={72}
                strokeWidth={7}
                label={`${daysCompleted}`}
                caption={challenge.challenge_type === 'points' ? 'tasks' : 'logs'}
                labelClassName="text-[16px] font-extrabold text-white"
                color="#72D9CB"
              />
              <AppText
                className="mt-1 text-center text-[12px] font-semibold"
                style={{ color: '#fff' }}
                numberOfLines={2}>
                {goalLabel}
              </AppText>
            </View>
          ) : (
            <View className="max-w-[42%] items-end">
              <AppText
                className="text-[11px] font-semibold uppercase"
                style={{ color: 'rgba(255,255,255,0.62)', letterSpacing: 0.6 }}>
                Goal
              </AppText>
              <AppText className="mt-1 text-right text-[15px] font-bold" style={{ color: '#fff' }}>
                {goalLabel}
              </AppText>
              {subtitle ? (
                <AppText
                  className="mt-0.5 text-right text-[11px]"
                  style={{ color: 'rgba(255,255,255,0.72)' }}>
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
