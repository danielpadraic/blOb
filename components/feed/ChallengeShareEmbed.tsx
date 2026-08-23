import {
  ChallengeInviteCard,
  type InviteChallenge,
  type InviteHost,
} from '@/components/challenge/ChallengeInviteCard';

export type ShareEmbedChallenge = InviteChallenge;
export type ShareEmbedHost = InviteHost;

export function ChallengeShareEmbed({
  challenge,
  joined,
  host,
  onPress,
}: {
  challenge: InviteChallenge;
  joined?: boolean;
  host?: InviteHost | null;
  onPress?: () => void;
}) {
  return (
    <ChallengeInviteCard
      challenge={challenge}
      theme={challenge.is_official ? 'official' : 'user'}
      context="feed"
      joined={joined}
      host={host}
      onPress={onPress}
    />
  );
}
