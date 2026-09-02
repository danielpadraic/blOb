import { isLiveOrUpcoming, isPrivateVisibility } from '@/lib/challengeDiscoverability';
import { isCreatorAccount } from '@/lib/creator';
import { isOfficialAccount } from '@/lib/official';

export type HomeRoundsReel = {
  id: string;
  user_id: string;
  challenge_id?: string | null;
  created_at?: string | null;
};

export type HomeRoundsContext = {
  liveOrUpcomingChallengeIds: Set<string>;
  memberChallengeIds: Set<string>;
  restrictedChallengeIds: Set<string>;
  /** Pin stub: Followed Coaches in follow-order (newest follow first). */
  followedCoachIds: string[];
};

/** Official or paid Creator. Followed ones are Coaches on Rounds. */
export function isHomeRoundsCoach(profile?: {
  id?: string | null;
  is_official?: boolean | null;
  is_admin?: boolean | null;
  is_creator?: boolean | null;
  username?: string | null;
} | null): boolean {
  return isOfficialAccount(profile) || isCreatorAccount(profile);
}

export function isRestrictedRoundChallenge(row: {
  privacy_mode?: string | null;
  visibility?: string | null;
  challenge_lane?: string | null;
}): boolean {
  const mode = String(row.privacy_mode ?? '').toLowerCase();
  if (mode === 'private' || mode === 'private_corporate') {
    return true;
  }
  return isPrivateVisibility(row.visibility) || row.challenge_lane === 'private';
}

export function reelOnLiveChallenge(reel: HomeRoundsReel, liveIds: Set<string>): boolean {
  const challengeId = String(reel.challenge_id ?? '').trim();
  return Boolean(challengeId && liveIds.has(challengeId));
}

export function reelFromFollowedCoach(reel: HomeRoundsReel, coachIds: Iterable<string>): boolean {
  const coaches = coachIds instanceof Set ? coachIds : new Set(coachIds);
  return Boolean(reel.user_id && coaches.has(reel.user_id));
}

/** Private / corporate Rounds never appear on a stranger’s rail. */
export function reelHiddenFromStranger(reel: HomeRoundsReel, ctx: HomeRoundsContext): boolean {
  const challengeId = String(reel.challenge_id ?? '').trim();
  if (!challengeId || !ctx.restrictedChallengeIds.has(challengeId)) {
    return false;
  }
  return !ctx.memberChallengeIds.has(challengeId);
}

export function reelBelongsOnHomeRounds(reel: HomeRoundsReel, ctx: HomeRoundsContext): boolean {
  if (!reel?.id || reelHiddenFromStranger(reel, ctx)) {
    return false;
  }
  return reelOnLiveChallenge(reel, ctx.liveOrUpcomingChallengeIds) || reelFromFollowedCoach(reel, ctx.followedCoachIds);
}

function createdMs(reel: HomeRoundsReel): number {
  const time = Date.parse(reel.created_at ?? '');
  return Number.isFinite(time) ? time : 0;
}

/**
 * (1) tagged to viewer’s live/upcoming joined-or-hosted — always, pins cannot hide.
 * (2) Followed Coach — order is follow-order only (pin stub).
 * Ended (1) drops; (2) can still keep a Followed Coach’s Round.
 */
export function selectHomeRounds<T extends HomeRoundsReel>(reels: T[], ctx: HomeRoundsContext): T[] {
  const path1: T[] = [];
  const path2: T[] = [];
  const seen = new Set<string>();
  for (const reel of reels) {
    if (!reel?.id || seen.has(reel.id) || !reelBelongsOnHomeRounds(reel, ctx)) {
      continue;
    }
    seen.add(reel.id);
    if (reelOnLiveChallenge(reel, ctx.liveOrUpcomingChallengeIds)) {
      path1.push(reel);
    } else {
      path2.push(reel);
    }
  }
  path1.sort((a, b) => createdMs(b) - createdMs(a));
  const coachRank = new Map(ctx.followedCoachIds.map((id, index) => [id, index]));
  path2.sort((a, b) => {
    const left = coachRank.get(a.user_id) ?? Number.MAX_SAFE_INTEGER;
    const right = coachRank.get(b.user_id) ?? Number.MAX_SAFE_INTEGER;
    if (left !== right) {
      return left - right;
    }
    return createdMs(b) - createdMs(a);
  });
  return [...path1, ...path2];
}

export function pickHostedRoundChallengeId(
  rows: Array<{ id?: string | null; created_by?: string | null; status?: string | null }>,
  userId?: string | null,
): string | null {
  if (!userId) {
    return null;
  }
  const hosted = rows.find(
    (row) => String(row.created_by ?? '') === userId && isLiveOrUpcoming(row.status) && String(row.id ?? '').trim(),
  );
  return hosted?.id ? String(hosted.id) : null;
}
