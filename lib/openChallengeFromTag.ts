import { isPrivateChallenge } from '@/lib/challengeDiscoverability';

export type ChallengeTagAccess = 'participant' | 'joinable' | 'private';

export type ChallengeTagOpenInput = {
  challengeId: string;
  visibility?: string | null;
  challenge_lane?: unknown;
  is_official?: boolean | null;
  isParticipant?: boolean;
  isHost?: boolean;
  shareHidden?: boolean;
};

/**
 * Access-aware open for a challenge tag on a post.
 * Participant / host → detail. Joinable public/unlisted → preview. Private → wall.
 */
export function challengeTagAccess(input: ChallengeTagOpenInput): ChallengeTagAccess {
  if (input.isParticipant || input.isHost) {
    return 'participant';
  }
  if (input.shareHidden) {
    return 'private';
  }
  if (input.is_official) {
    return 'joinable';
  }
  if (
    isPrivateChallenge({
      visibility: input.visibility,
      challenge_lane: input.challenge_lane,
    })
  ) {
    return 'private';
  }
  return 'joinable';
}
