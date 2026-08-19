import { isInviteOnlyChallenge } from '@/lib/challengeLane';

export type ChallengeDiscoverability = 'invite_only' | 'friends_of_friends';

const LIVE_OR_UPCOMING = [
  'open',
  'upcoming',
  'starting',
  'in_progress',
  'filling',
  'arming',
  'live',
] as const;
const JOINABLE_NOT_STARTED = ['open', 'upcoming', 'starting', 'filling', 'arming'] as const;

export function isPrivateVisibility(visibility: string | null | undefined): boolean {
  const value = String(visibility ?? '').toLowerCase();
  return value === 'private' || value === 'invite';
}

export function isLiveOrUpcoming(status: string | null | undefined): boolean {
  return (LIVE_OR_UPCOMING as readonly string[]).includes(status ?? '');
}

export function isJoinableNotStarted(status: string | null | undefined): boolean {
  return (JOINABLE_NOT_STARTED as readonly string[]).includes(status ?? '');
}

export function defaultDiscoverability(input: {
  visibility?: string | null;
  currency?: string | null;
  isOfficial?: boolean;
  challengeLane?: string | null;
}): ChallengeDiscoverability | null {
  if (input.isOfficial || !isPrivateChallenge(input)) {
    return null;
  }
  return input.currency === 'bucks' ? 'invite_only' : 'friends_of_friends';
}

export function isPrivateChallenge(input: {
  visibility?: string | null;
  challengeLane?: string | null;
  challenge_lane?: unknown;
}): boolean {
  return isInviteOnlyChallenge({
    visibility: input.visibility,
    challenge_lane: input.challengeLane ?? input.challenge_lane,
  });
}

export function isInviteOnlyDiscoverable(input: {
  visibility?: string | null;
  challengeLane?: string | null;
  challenge_lane?: unknown;
  discoverability?: string | null;
}): boolean {
  if (!isPrivateChallenge(input)) {
    return false;
  }
  return (input.discoverability ?? 'invite_only') !== 'friends_of_friends';
}

export function resolveDiscoverability(input: {
  visibility?: string | null;
  currency?: string | null;
  isOfficial?: boolean;
  challengeLane?: string | null;
  friendsOfFriends?: boolean;
}): ChallengeDiscoverability | null {
  const fallback = defaultDiscoverability(input);
  if (fallback == null) {
    return null;
  }
  if (input.friendsOfFriends == null) {
    return fallback;
  }
  return input.friendsOfFriends ? 'friends_of_friends' : 'invite_only';
}
