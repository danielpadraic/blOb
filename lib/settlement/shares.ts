export type RemainingParticipant = {
  user_id: string;
  days_completed?: number | null;
  status?: string | null;
  eliminated_at?: string | null;
};

export function settlementRequiredDays(challenge: {
  target_count?: number | null;
  days_required?: number | null;
  required_checkins?: number | null;
} | null | undefined): number {
  return Math.max(
    Number(challenge?.target_count) || 0,
    Number(challenge?.days_required) || 0,
    Number(challenge?.required_checkins) || 0,
    1,
  );
}

export function isRemainingEligible(
  row: RemainingParticipant,
  requiredDays: number,
  provenDays?: number | null,
): boolean {
  if (row.eliminated_at) {
    return false;
  }
  const status = String(row.status ?? 'joined');
  if (['refunded_pre_start', 'withdrawn', 'eliminated', 'failed'].includes(status)) {
    return false;
  }
  const proven = Number(provenDays ?? row.days_completed ?? 0);
  return proven >= requiredDays;
}

export function remainingEligible(
  participants: RemainingParticipant[],
  requiredDays: number,
  provenByUser?: Record<string, number>,
): RemainingParticipant[] {
  return participants.filter((row) =>
    isRemainingEligible(row, requiredDays, provenByUser?.[row.user_id]),
  );
}

/** Coins: ceil(pool / winners), same whole number each. Bucks keep a cents split. */
export function evenSplitShares(
  pool: number,
  count: number,
  currency?: string | null,
): number[] {
  if (!Number.isFinite(pool) || count <= 0) {
    return [];
  }
  if (String(currency ?? 'coins') === 'bucks') {
    const total = Math.round(pool * 100) / 100;
    const share = Math.round((total / count) * 100) / 100;
    const leftover = Math.round((total - share * count) * 100) / 100;
    return Array.from({ length: count }, (_, index) =>
      index === count - 1 ? Math.round((share + leftover) * 100) / 100 : share,
    );
  }
  const share = Math.ceil(Math.max(pool, 0) / count);
  return Array.from({ length: count }, () => share);
}

export function payoutSlices(
  userIds: string[],
  pool: number,
  currency?: string | null,
): Array<{ user_id: string; amount: number; place: 1; reason: 'distribute_win' }> {
  const shares = evenSplitShares(pool, userIds.length, currency);
  return userIds.map((user_id, index) => ({
    user_id,
    amount: shares[index] ?? 0,
    place: 1 as const,
    reason: 'distribute_win' as const,
  }));
}
