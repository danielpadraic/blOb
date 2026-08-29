import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { ChallengeCardVisual, type CardHost } from '@/components/challenge/ChallengeCardVisual';
import { ChallengeCardClock } from '@/components/challenge/ChallengeScheduleMeta';
import { ChallengeOverflowButton, type MenuAnchor } from '@/components/challenge/ChallengeOverflowMenu';
import { Avatar } from '@/components/ui/Avatar';
import { AppText } from '@/components/ui/AppText';
import { useCopyTone } from '@/hooks/useCopy';
import { copy } from '@/lib/copy';
import { isOfficialJoinable } from '@/lib/officialSeries';
import type { ChallengeWithStats } from '@/lib/types';

type ChallengeCardProps = {
  challenge: ChallengeWithStats;
  onPress?: () => void;
  myDays?: number | null;
  myMeters?: number | null;
  variant?: 'discover' | 'rail';
  joined?: boolean;
  hosting?: boolean;
  invited?: boolean;
  onJoin?: () => void;
  friendCount?: number;
  participantStatus?: string | null;
  socialProof?: { name: string; avatarUrl?: string | null; kind: 'hosting' | 'joined' };
  host?: CardHost | null;
  onOverflow?: (anchor: MenuAnchor) => void;
};

export function ChallengeCard({
  challenge,
  onPress,
  myDays,
  myMeters,
  variant = 'discover',
  joined = false,
  hosting = false,
  invited = false,
  onJoin,
  socialProof,
  host,
  onOverflow,
}: ChallengeCardProps) {
  const tone = useCopyTone();
  const official = Boolean(challenge.is_official);
  const ticking = official && (isOfficialJoinable(challenge) || challenge.status === 'live');
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!ticking) {
      return;
    }
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [ticking]);

  const resolvedHost =
    host ??
    (socialProof?.kind === 'hosting'
      ? { name: socialProof.name, avatarUrl: socialProof.avatarUrl }
      : hosting
        ? { name: 'You' }
        : null);

  const primaryLabel = joined ? 'Continue' : onJoin ? 'Join' : onPress ? 'View' : null;
  const onPrimary = joined || !onJoin ? onPress : onJoin;

  return (
    <View>
      <View>
        <ChallengeCardVisual
          challenge={challenge}
          joined={joined}
          hosting={hosting}
          invited={invited}
          myDays={myDays}
          myMeters={myMeters}
          host={official ? null : resolvedHost}
          nowMs={nowMs}
          onPress={onPress}
          primaryLabel={primaryLabel}
          onPrimary={onPrimary}
          showOfficialShare={official}
          compact={variant === 'rail'}
        />
        <View style={{ position: 'absolute', top: 6, right: 6, zIndex: 2, alignItems: 'flex-end' }}>
          <ChallengeCardClock challenge={challenge} nowMs={nowMs} overlay light={official} />
          {onOverflow ? <ChallengeOverflowButton onPress={onOverflow} light={official} /> : null}
        </View>
      </View>
      {variant === 'rail' && socialProof && socialProof.kind === 'joined' ? (
        <View className="mt-2 flex-row items-center" style={{ minHeight: 44 }}>
          <Avatar uri={socialProof.avatarUrl} name={socialProof.name} size={28} />
          <AppText className="ml-2 flex-1 text-[12px] font-semibold text-charcoal" numberOfLines={1}>
            {copy('lobby.friendsJoined', tone, { name: socialProof.name })}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}
