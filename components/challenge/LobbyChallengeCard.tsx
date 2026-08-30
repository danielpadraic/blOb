import {
  ChallengeInviteCard,
  LobbyChallengeRow,
  inviteCardCanCheckIn as lobbyCardCanCheckIn,
  inviteCardCanJoin as lobbyCardCanJoin,
  inviteCardStatus as lobbyCardStatus,
  type ChallengeInviteCardProps,
} from '@/components/challenge/ChallengeInviteCard';

export type { InviteHost } from '@/components/challenge/ChallengeInviteCard';
export { LobbyChallengeRow, lobbyCardCanCheckIn, lobbyCardCanJoin, lobbyCardStatus };

export function LobbyChallengeCard(props: ChallengeInviteCardProps) {
  return <ChallengeInviteCard {...props} surface="lobby-list" />;
}
