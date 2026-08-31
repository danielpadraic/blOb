import {
  formatFamilyOf,
  isIllegalFormatPayoutPair,
  type FormatFamily,
  type PayoutPair,
} from '@/lib/formatPayout';
import { evenSplitShares } from '@/lib/settlement/shares';

export type RankedBoardRow = {
  user_id: string;
  score?: number | null;
  status?: string | null;
  eliminated_at?: string | null;
};

export type RankedShare = {
  user_id: string;
  amount: number;
  place: number;
  score: number;
  reason: 'distribute_win';
};

export type RankedPayoutInput = {
  pool: number;
  currency?: string | null;
  rows: RankedBoardRow[];
  family?: FormatFamily;
  format?: string | null;
  challenge_type?: string | null;
  prize_structure?: string | null;
  payout_mode?: string | null;
  top_places_mode?: string | null;
  top_places_value?: string | number | null;
  top_places_distribution?: string | null;
};

const DROPPED = new Set(['refunded_pre_start', 'withdrawn', 'eliminated', 'failed']);

export const ILLEGAL_POINTS_EVEN_SPLIT_COPY =
  'Points and cumulative challenges can’t use Even split remaining. Pick Winner take all or top places.';
export const ILLEGAL_CONSISTENCY_TOP_PLACES_COPY =
  'Consistency challenges can’t use Top #, Top %, or Scaled. Pick Even split remaining or Last standing.';

export function isDroppedRankedRow(row: RankedBoardRow): boolean {
  if (row.eliminated_at) {
    return true;
  }
  return DROPPED.has(String(row.status ?? 'joined'));
}

export function rankedEligible(rows: RankedBoardRow[]): RankedBoardRow[] {
  return rows.filter((row) => row.user_id && !isDroppedRankedRow(row));
}

function asFamily(input: RankedPayoutInput): FormatFamily {
  return input.family ?? formatFamilyOf(input);
}

function asPair(input: RankedPayoutInput): Pick<
  PayoutPair,
  'prize_structure' | 'payout_mode' | 'top_places_mode' | 'top_places_value' | 'top_places_distribution'
> {
  return {
    prize_structure: (input.prize_structure as PayoutPair['prize_structure']) ?? 'equal_split',
    payout_mode: (input.payout_mode as PayoutPair['payout_mode']) ?? 'even_split_remaining',
    top_places_mode: (input.top_places_mode as PayoutPair['top_places_mode']) ?? 'count',
    top_places_value: input.top_places_value != null ? String(input.top_places_value) : '3',
    top_places_distribution:
      (input.top_places_distribution as PayoutPair['top_places_distribution']) ?? 'even',
  };
}

function assertLegalPair(input: RankedPayoutInput): void {
  const family = asFamily(input);
  if (
    !isIllegalFormatPayoutPair({
      format: input.format,
      challenge_type: input.challenge_type ?? (family === 'points' ? 'points' : 'consistency'),
      prize_structure: input.prize_structure,
      payout_mode: input.payout_mode,
    })
  ) {
    return;
  }
  throw new Error(family === 'consistency' ? ILLEGAL_CONSISTENCY_TOP_PLACES_COPY : ILLEGAL_POINTS_EVEN_SPLIT_COPY);
}

function sortByScore(rows: RankedBoardRow[]): RankedBoardRow[] {
  return rows.slice().sort((a, b) => {
    const score = Number(b.score ?? 0) - Number(a.score ?? 0);
    if (score !== 0) {
      return score;
    }
    return String(a.user_id).localeCompare(String(b.user_id));
  });
}

function topSlots(eligible: RankedBoardRow[], input: RankedPayoutInput): number {
  const pair = asPair(input);
  const raw = Number(pair.top_places_value);
  const value = Number.isFinite(raw) && raw > 0 ? raw : pair.top_places_mode === 'percent' ? 25 : 3;
  if (pair.top_places_mode === 'percent') {
    const scored = eligible.some((row) => Number(row.score ?? 0) > 0);
    if (!scored) {
      return 0;
    }
    return Math.max(1, Math.ceil((eligible.length * value) / 100));
  }
  return Math.max(1, Math.floor(value));
}

function awardedForCut(sorted: RankedBoardRow[], slots: number): RankedBoardRow[] {
  if (slots <= 0 || sorted.length === 0) {
    return [];
  }
  const cut = sorted[Math.min(slots, sorted.length) - 1];
  const floor = Number(cut?.score ?? 0);
  return sorted.filter((row) => Number(row.score ?? 0) >= floor);
}

function placeOf(sorted: RankedBoardRow[], index: number): number {
  const score = Number(sorted[index]?.score ?? 0);
  let place = 1;
  for (let i = 0; i < index; i += 1) {
    if (Number(sorted[i]?.score ?? 0) > score) {
      place = i + 2;
    }
  }
  return place;
}

function leftoverToHighest(amounts: number[], leftover: number, currency?: string | null): number[] {
  const next = amounts.slice();
  if (leftover <= 0 || next.length === 0) {
    return next;
  }
  const unit = String(currency ?? 'coins') === 'bucks' ? 0.01 : 1;
  const steps = String(currency ?? 'coins') === 'bucks' ? Math.round(leftover * 100) : Math.floor(leftover);
  for (let i = 0; i < steps && i < next.length; i += 1) {
    next[i] = Math.round((next[i]! + unit) * 100) / 100;
  }
  return next;
}

/** Scaled weights are N, N-1, … 1. Ties share that place’s combined weight. */
export function scaledWeights(count: number): number[] {
  if (count <= 0) {
    return [];
  }
  return Array.from({ length: count }, (_, index) => count - index);
}

function scaledAmounts(
  pool: number,
  awarded: RankedBoardRow[],
  currency?: string | null,
): number[] {
  const n = awarded.length;
  if (n <= 0) {
    return [];
  }
  const weights = scaledWeights(n);
  const groupWeight = new Map<number, number>();
  const groupSize = new Map<number, number>();
  awarded.forEach((row, index) => {
    const score = Number(row.score ?? 0);
    groupWeight.set(score, (groupWeight.get(score) ?? 0) + (weights[index] ?? 0));
    groupSize.set(score, (groupSize.get(score) ?? 0) + 1);
  });
  const coins = String(currency ?? 'coins') !== 'bucks';
  const total = coins ? Math.floor(Math.max(pool, 0)) : Math.round(Math.max(pool, 0) * 100) / 100;
  if (total <= 0) {
    return [];
  }
  const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
  const raw = awarded.map((row) => {
    const score = Number(row.score ?? 0);
    const share = ((groupWeight.get(score) ?? 0) / Math.max(groupSize.get(score) ?? 1, 1) / weightSum) * total;
    return coins ? Math.floor(share) : Math.floor(share * 100) / 100;
  });
  const paid = raw.reduce((sum, amount) => sum + amount, 0);
  const leftover = coins ? total - paid : Math.round((total - paid) * 100) / 100;
  return leftoverToHighest(raw, leftover, currency);
}

function slicesFor(
  awarded: RankedBoardRow[],
  amounts: number[],
): RankedShare[] {
  return awarded
    .map((row, index) => ({
      user_id: row.user_id,
      amount: amounts[index] ?? 0,
      place: placeOf(awarded, index),
      score: Number(row.score ?? 0),
      reason: 'distribute_win' as const,
    }))
    .filter((row) => row.amount > 0);
}

export function resultWhyCopy(input: {
  family?: FormatFamily | null;
  format?: string | null;
  challenge_type?: string | null;
  prize_structure?: string | null;
  payout_mode?: string | null;
  top_places_distribution?: string | null;
}): string {
  const family = input.family ?? formatFamilyOf(input);
  const structure = String(input.prize_structure ?? '').toLowerCase();
  const payout = String(input.payout_mode ?? '').toLowerCase();
  if (family === 'consistency' && (structure === 'winner_take_all' || payout === 'winner_take_all')) {
    return 'Last standing.';
  }
  if (structure === 'top_places' || payout === 'top_places') {
    return String(input.top_places_distribution ?? '') === 'scaled'
      ? 'Highest points. Scaled.'
      : 'Highest points. Tie split.';
  }
  if (family === 'points') {
    return 'Highest points. Tie split.';
  }
  return 'Everyone still in split.';
}

export function rankedShares(input: RankedPayoutInput): RankedShare[] {
  assertLegalPair(input);
  const family = asFamily(input);
  const pair = asPair(input);
  const eligible = sortByScore(rankedEligible(input.rows));
  const pool = Number(input.pool);
  if (!Number.isFinite(pool) || pool <= 0 || eligible.length === 0) {
    return [];
  }

  const lastStanding =
    family === 'consistency' &&
    (pair.prize_structure === 'winner_take_all' || pair.payout_mode === 'winner_take_all');
  const winnerTakeAll =
    pair.prize_structure === 'winner_take_all' || pair.payout_mode === 'winner_take_all';
  const topPlaces = pair.prize_structure === 'top_places' || pair.payout_mode === 'top_places';

  let awarded = eligible;
  if (lastStanding || (family === 'points' && winnerTakeAll && !topPlaces)) {
    const best = Number(eligible[0]?.score ?? 0);
    if (family === 'points' && best <= 0) {
      return [];
    }
    awarded = eligible.filter((row) => Number(row.score ?? 0) === best);
  } else if (topPlaces) {
    const slots = topSlots(eligible, input);
    awarded = awardedForCut(eligible, slots);
    if (awarded.every((row) => Number(row.score ?? 0) <= 0)) {
      return [];
    }
  } else if (family === 'points') {
    throw new Error(ILLEGAL_POINTS_EVEN_SPLIT_COPY);
  }

  if (awarded.length === 0) {
    return [];
  }

  const scaled = topPlaces && pair.top_places_distribution === 'scaled';
  const amounts = scaled
    ? scaledAmounts(pool, awarded, input.currency)
    : evenSplitShares(pool, awarded.length, input.currency);
  return slicesFor(awarded, amounts);
}
