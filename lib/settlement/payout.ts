import { prizeStructureSummary, type PrizeStructureConfig } from '@/lib/challenges';

export type EvenSplitPayoutInput = {
  is_unlimited?: boolean | null;
  end_mode?: string | null;
  challenge_type?: string | null;
  prize_structure?: string | null;
  payout_mode?: string | null;
  format?: string | null;
};

export type SettlementPayoutRpc = 'settle_ended_challenge' | 'distribute_challenge';

function asKey(value: unknown): string {
  return String(value ?? '').trim().toLowerCase();
}

function isLmsPayout(challenge: EvenSplitPayoutInput): boolean {
  return (
    Boolean(challenge.is_unlimited) ||
    asKey(challenge.end_mode) === 'indefinite_lms' ||
    asKey(challenge.challenge_type) === 'lms' ||
    asKey(challenge.format) === 'lms'
  );
}

function isRankedPrize(challenge: EvenSplitPayoutInput): boolean {
  const payout = asKey(challenge.payout_mode);
  const structure = asKey(challenge.prize_structure);
  return (
    payout === 'winner_take_all' ||
    payout === 'top_places' ||
    structure === 'winner_take_all' ||
    structure === 'top_places'
  );
}

function isPointsBoard(challenge: EvenSplitPayoutInput): boolean {
  const type = asKey(challenge.challenge_type);
  const format = asKey(challenge.format);
  return type === 'points' || type === 'cumulative' || format === 'points' || format === 'cumulative';
}

/** Remaining (or everyone who hit the Cumulative target) split. Not WTA / top places / LMS. */
export function isEvenSplitPayout(challenge: EvenSplitPayoutInput | null | undefined): boolean {
  if (!challenge || isLmsPayout(challenge) || isRankedPrize(challenge)) {
    return false;
  }
  const payout = asKey(challenge.payout_mode);
  if (payout === 'even_split_remaining' || payout === '') {
    return true;
  }
  const structure = asKey(challenge.prize_structure);
  return structure === 'equal_split' || structure === 'even_split_remaining' || structure === '';
}

export function settlementRpcForPayout(
  challenge: EvenSplitPayoutInput | null | undefined,
): SettlementPayoutRpc {
  if (isLmsPayout(challenge ?? {})) {
    return 'distribute_challenge';
  }
  if (isPointsBoard(challenge) || isRankedPrize(challenge) || isEvenSplitPayout(challenge)) {
    return 'settle_ended_challenge';
  }
  return 'distribute_challenge';
}

export function settlePayoutConfirmCopy(
  challenge: EvenSplitPayoutInput & PrizeStructureConfig,
): string {
  if (isPointsBoard(challenge) && !isEvenSplitPayout(challenge)) {
    return 'Highest points wins. Ties split.';
  }
  const payout = asKey(challenge.payout_mode);
  const structure = asKey(challenge.prize_structure);
  if (payout === 'top_places' || structure === 'top_places') {
    return prizeStructureSummary(challenge);
  }
  if (!isEvenSplitPayout(challenge)) {
    return 'Last standing takes the prize.';
  }
  return 'Everyone still in splits the prize.';
}
