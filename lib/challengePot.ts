const ENDED_POT_STATUSES = new Set([
  'ended',
  'settling',
  'settled',
  'judging',
  'distributing',
  'cancelled',
  'cancelled_underfilled',
]);

export type ChallengePotInput = {
  status?: string | null;
  prize_pool?: number | null;
  host_budget?: number | null;
  creator_contribution?: number | null;
  buy_in_amount?: number | null;
  settled_prize_pool?: number | null;
};

export function isEndedPrizeStatus(status?: string | null): boolean {
  return ENDED_POT_STATUSES.has(String(status ?? ''));
}

/** Live/upcoming: challenges.prize_pool. After settle that column is zeroed. */
export function displayChallengePot(challenge: ChallengePotInput): number {
  if (!isEndedPrizeStatus(challenge.status)) {
    return Math.max(Number(challenge.prize_pool) || 0, 0);
  }
  if (challenge.settled_prize_pool != null && Number.isFinite(Number(challenge.settled_prize_pool))) {
    return Math.max(Number(challenge.settled_prize_pool), 0);
  }
  const budget = Math.max(
    Number(challenge.host_budget) || Number(challenge.creator_contribution) || 0,
    0,
  );
  if (budget > 0) {
    return budget;
  }
  return 0;
}
