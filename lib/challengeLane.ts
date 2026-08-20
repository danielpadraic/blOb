import type { ChallengeLane } from '@/lib/types';

export type { ChallengeLane };

export type UserChallengeLane = 'coins' | 'private';

export function normalizeUserChallengeLane(value: unknown): UserChallengeLane {
  return value === 'private' ? 'private' : 'coins';
}

/** Invite-only private lane. Coin unlisted (visibility private + participants) is not this. */
export function isInviteOnlyChallenge(input: {
  challenge_lane?: unknown;
  visibility?: unknown;
  funding_model?: unknown;
} | null | undefined): boolean {
  if (!input) {
    return false;
  }
  if (input.challenge_lane === 'private') {
    return true;
  }
  return String(input.visibility ?? '').toLowerCase() === 'invite';
}

export type LanePublishFields = {
  challenge_lane: UserChallengeLane;
  visibility: 'public' | 'private' | 'friends' | 'invite';
  currency: 'coins' | 'bucks';
  buy_in_amount: number;
};

export function applyLaneForPublish(input: {
  challenge_lane?: unknown;
  visibility?: string | null;
  currency?: string | null;
  buy_in_amount?: number | string | null;
  host_funded?: boolean;
}): LanePublishFields {
  const lane = normalizeUserChallengeLane(input.challenge_lane);
  const buyIn = Math.max(Number(input.buy_in_amount) || 0, 0);
  const vis = String(input.visibility ?? 'public').toLowerCase();
  const visibility: LanePublishFields['visibility'] =
    vis === 'friends' ? 'friends' : vis === 'invite' ? 'invite' : vis === 'private' ? 'private' : 'public';

  if (lane === 'private') {
    return {
      challenge_lane: 'private',
      visibility: visibility === 'invite' ? 'invite' : 'private',
      currency: input.currency === 'bucks' ? 'bucks' : 'coins',
      buy_in_amount: 0,
    };
  }

  if (input.currency === 'bucks' || input.host_funded) {
    return {
      challenge_lane: 'coins',
      visibility,
      currency: 'bucks',
      buy_in_amount: 0,
    };
  }

  return {
    challenge_lane: 'coins',
    visibility,
    currency: 'coins',
    buy_in_amount: buyIn,
  };
}

export type LaneFormSlice = {
  challenge_lane?: unknown;
  visibility?: string | null;
  currency?: string | null;
  buy_in?: string | number | null;
  funding_model?: string | null;
  creator_contribution?: string | number | null;
};

export function applyLaneToFormValues<T extends LaneFormSlice>(values: T, lane: UserChallengeLane): T {
  if (lane === 'private') {
    const contribution = Math.max(Number(values.creator_contribution) || 0, 0);
    return {
      ...values,
      challenge_lane: 'private',
      visibility: 'private',
      buy_in: '0',
      funding_model: 'creator',
      creator_contribution: contribution >= 1 ? String(values.creator_contribution) : '10',
      currency: values.currency === 'bucks' ? 'bucks' : 'coins',
    };
  }
  return {
    ...values,
    challenge_lane: 'coins',
    currency: 'coins',
    visibility:
      values.visibility === 'friends' || values.visibility === 'invite' || values.visibility === 'private'
        ? values.visibility
        : 'public',
  };
}

export function laneReviewLine(input: {
  challenge_lane?: unknown;
  visibility?: string | null;
}): string {
  if (normalizeUserChallengeLane(input.challenge_lane) === 'private') {
    return 'Invite-only. You are funding the prize. Competitors are not charged an entry fee.';
  }
  const listed = input.visibility === 'private' ? 'Unlisted' : 'Public';
  return `Competitors compete for Coins. ${listed} in Lobby.`;
}
