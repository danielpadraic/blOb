import { CHALLENGE_STATUS_LABEL } from '@/lib/constants';
import { copy } from '@/lib/copy';
import { isBucksChallenge } from '@/lib/currency';
import { isPointsChallenge } from '@/lib/challenges';

/** One color per tag TYPE. Color stays even if the label copy changes. */
export type ChallengeTagKind =
  | 'official'
  | 'public'
  | 'private'
  | 'hosting'
  | 'consistency'
  | 'filling'
  | 'arming'
  | 'live'
  | 'coins'
  | 'joined'
  | 'points'
  | 'invited'
  | 'notJoined';

export type ChallengeTagToken = {
  bg: string;
  fg: string;
};

/** Small, low-saturation fills. Full near-black only for Official. */
export const CHALLENGE_TAG_TOKENS: Record<ChallengeTagKind, ChallengeTagToken> = {
  official: { bg: '#151716', fg: '#FFFFFF' },
  public: { bg: '#E4EBE4', fg: '#5F6B63' },
  private: { bg: '#EBE4F0', fg: '#6A5A78' },
  hosting: { bg: '#E4D8F2', fg: '#4B2A7A' },
  consistency: { bg: '#E7F7F3', fg: '#2C9B89' },
  filling: { bg: '#F6EED8', fg: '#9A7420' },
  arming: { bg: '#F6E6C8', fg: '#B07A18' },
  live: { bg: '#DFF3E3', fg: '#2E7A42' },
  coins: { bg: '#F4E6C1', fg: '#A07C12' },
  joined: { bg: '#E7F7F3', fg: '#2C9B89' },
  points: { bg: '#DCE8F2', fg: '#3D6A8A' },
  invited: { bg: '#EBE4F0', fg: '#6A5A78' },
  notJoined: { bg: '#E8EBE8', fg: '#7F8581' },
};

export type ChallengeTagSpec = {
  kind: ChallengeTagKind;
  label: string;
};

type TagChallenge = {
  is_official?: boolean | null;
  visibility?: string | null;
  status?: string | null;
  challenge_type?: string | null;
  currency?: string | null;
  buy_in_amount?: number | null;
};

function statusKind(status: string | null | undefined): ChallengeTagKind | null {
  const value = String(status ?? '').toLowerCase();
  if (value === 'filling' || value === 'open' || value === 'upcoming' || value === 'starting') {
    return 'filling';
  }
  if (value === 'arming' || value === 'judging') {
    return 'arming';
  }
  if (value === 'live' || value === 'in_progress') {
    return 'live';
  }
  return null;
}

export function challengeCardTags(input: {
  challenge: TagChallenge;
  hosting?: boolean;
  joined?: boolean;
  invited?: boolean;
  showNotJoined?: boolean;
}): ChallengeTagSpec[] {
  const { challenge } = input;
  const tags: ChallengeTagSpec[] = [];

  if (challenge.is_official) {
    tags.push({
      kind: 'official',
      label:
        Boolean(challenge.is_official) &&
        isBucksChallenge(challenge) &&
        Number(challenge.buy_in_amount) <= 0
          ? 'Sponsored'
          : 'Official',
    });
  }

  const visibility = String(challenge.visibility ?? 'public').toLowerCase();
  if (visibility === 'private' || visibility === 'invite') {
    tags.push({ kind: 'private', label: visibility === 'invite' ? 'Invite only' : 'Private' });
  } else {
    tags.push({ kind: 'public', label: 'Public' });
  }

  if (input.hosting) {
    tags.push({ kind: 'hosting', label: 'Hosting' });
  }

  if (input.joined) {
    tags.push({ kind: 'joined', label: copy('feed.youreIn') });
  } else if (input.showNotJoined) {
    tags.push({ kind: 'notJoined', label: copy('feed.notJoined') });
  } else if (input.invited) {
    tags.push({ kind: 'invited', label: 'Invited' });
  }

  if (isPointsChallenge(challenge)) {
    tags.push({ kind: 'points', label: 'Points' });
  } else {
    tags.push({ kind: 'consistency', label: 'Consistency' });
  }

  const phase = statusKind(challenge.status);
  if (phase) {
    tags.push({
      kind: phase,
      label: CHALLENGE_STATUS_LABEL[String(challenge.status)] ?? String(challenge.status),
    });
  }

  if (!isBucksChallenge(challenge)) {
    tags.push({ kind: 'coins', label: 'Coins' });
  }

  return tags;
}
