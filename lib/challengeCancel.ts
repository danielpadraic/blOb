import type { Challenge } from '@/lib/types';

const CLOSED = new Set(['settled', 'cancelled', 'cancelled_underfilled']);

export function isOtherJoiner(row: {
  user_id?: string | null;
  status?: string | null;
}, hostId: string | null | undefined): boolean {
  if (!row.user_id || !hostId || row.user_id === hostId) {
    return false;
  }
  return String(row.status ?? 'joined') !== 'refunded_pre_start';
}

export function countOtherJoiners(
  rows: { user_id?: string | null; status?: string | null }[] | null | undefined,
  hostId: string | null | undefined,
): number {
  return (rows ?? []).filter((row) => isOtherJoiner(row, hostId)).length;
}

export function estimatedOtherJoiners(participantCount?: number | null): number | null {
  if (participantCount == null || !Number.isFinite(Number(participantCount))) {
    return null;
  }
  return Math.max(0, Number(participantCount) - 1);
}

export function canCancelChallenge(input: {
  challenge: Pick<Challenge, 'status' | 'starts_at' | 'created_by'> | null | undefined;
  viewerId?: string | null;
  official?: boolean;
  otherJoiners?: number;
  rosterReady?: boolean;
}): boolean {
  const challenge = input.challenge;
  if (!challenge || !input.viewerId) {
    return false;
  }
  if (CLOSED.has(String(challenge.status))) {
    return false;
  }
  if (input.official) {
    return true;
  }
  if (challenge.created_by !== input.viewerId) {
    return false;
  }
  if (!input.rosterReady) {
    return false;
  }
  if ((input.otherJoiners ?? 0) > 0) {
    return false;
  }
  if (!challenge.starts_at || new Date(challenge.starts_at).getTime() <= Date.now()) {
    return false;
  }
  return true;
}

export function canCancelChallengeCard(input: {
  challenge: Pick<Challenge, 'status' | 'starts_at' | 'created_by'> & {
    participant_count?: number | null;
  };
  viewerId?: string | null;
  official?: boolean;
}): boolean {
  const others = estimatedOtherJoiners(input.challenge.participant_count);
  return canCancelChallenge({
    challenge: input.challenge,
    viewerId: input.viewerId,
    official: input.official,
    otherJoiners: others ?? 0,
    rosterReady: others != null || Boolean(input.official),
  });
}
