/**
 * Cash Officials — the house's real-money ladder, advertised on the Home hero.
 *
 * Coins are the home base (see lib/officialCoin.ts). This module only describes
 * the paid weekly $1 / monthly $10 rooms and the gates that keep them shut
 * until payouts are live. Nothing here charges anyone.
 */
import { OFFICIAL_DOB_COPY, type OfficialDobStatus } from '@/lib/officialDob';
import { bucketForRegion, GEO_UNAVAILABLE_COPY, normalizeRegion } from '@/lib/geo/regions';
import { isOfficialCoinChallenge } from '@/lib/officialCoin';

/**
 * Finix contest MID is not live yet, so no cash join may start.
 * Flip this one line when payouts go live.
 */
export const CASH_OFFICIAL_JOINS_LIVE = false;

export const CASH_OFFICIAL_WEEKLY_USD = 1;
export const CASH_OFFICIAL_MONTHLY_USD = 10;

export const CASH_OFFICIAL_BANNER = {
  title: `Weekly $${CASH_OFFICIAL_WEEKLY_USD} · Monthly $${CASH_OFFICIAL_MONTHLY_USD}`,
  helper: 'Real money Officials. Skill, not chance.',
  cta: 'View',
} as const;

/** Shown wherever the paid Join / Pay control lives while the MID is held. */
export const CASH_OFFICIAL_PAYOUTS_PENDING = 'Cash Officials open when payouts go live.';

export type CashOfficialGate =
  | 'open'
  | 'payouts_pending'
  | 'underage'
  | 'dob_required'
  | 'geo_blocked';

/**
 * Why a cash Official join cannot start. Legal gates win over the payouts hold:
 * a 17 year old is not "waiting for Finix", they are never eligible.
 *
 * Only `blocked` states are refused here. `limited` states depend on the money
 * shape of the specific room, so they stay with the per-challenge check
 * (`challenge_available_in_jurisdiction` / `cashJoinUi`), which is authoritative.
 */
export function cashOfficialGate(input: {
  dobStatus?: OfficialDobStatus | null;
  declaredRegion?: string | null;
  joinsLive?: boolean;
}): CashOfficialGate {
  if (input.dobStatus === 'underage') {
    return 'underage';
  }
  const region = normalizeRegion(input.declaredRegion);
  if (region && bucketForRegion(region) === 'blocked') {
    return 'geo_blocked';
  }
  if (!(input.joinsLive ?? CASH_OFFICIAL_JOINS_LIVE)) {
    return 'payouts_pending';
  }
  if (input.dobStatus === 'dob_required') {
    return 'dob_required';
  }
  return 'open';
}

export function cashOfficialJoinsAllowed(gate: CashOfficialGate): boolean {
  return gate === 'open';
}

/** Copy for the disabled Join / Pay $1 / Pay $10 control. */
export function cashOfficialJoinBlockedCopy(gate: CashOfficialGate): string {
  if (gate === 'underage') {
    return OFFICIAL_DOB_COPY.underageTitle;
  }
  if (gate === 'geo_blocked') {
    return GEO_UNAVAILABLE_COPY;
  }
  if (gate === 'dob_required') {
    return OFFICIAL_DOB_COPY.missingTitle;
  }
  if (gate === 'payouts_pending') {
    return CASH_OFFICIAL_PAYOUTS_PENDING;
  }
  return '';
}

/**
 * Home hero subline. Stays the sales line by default — the banner only offers
 * View, never a charge. It swaps to the legal line rather than advertise a
 * price to someone who can never pay it.
 */
export function cashOfficialBannerHelper(gate: CashOfficialGate): string {
  if (gate === 'underage' || gate === 'geo_blocked') {
    return cashOfficialJoinBlockedCopy(gate);
  }
  return CASH_OFFICIAL_BANNER.helper;
}

export type OfficialCashChallenge = {
  is_official?: boolean | null;
  official_kind?: string | null;
  currency?: string | null;
  challenge_lane?: string | null;
  buy_in_amount?: number | string | null;
};

function isCashLane(challenge: OfficialCashChallenge): boolean {
  const currency = String(challenge.currency ?? '').toLowerCase();
  const lane = String(challenge.challenge_lane ?? '').toLowerCase();
  return (
    currency === 'bucks' ||
    currency === 'cash' ||
    currency === 'usd' ||
    lane === 'bucks' ||
    lane === 'cash'
  );
}

/**
 * A house real-money Official with a paid entry. Mirrors
 * `public.challenge_is_official_cash` plus a buy-in, and never the standing
 * Official Coin rooms. User-created $ rooms are not Official, so they are out.
 */
export function isOfficialCashChallenge(challenge?: OfficialCashChallenge | null): boolean {
  if (!challenge?.is_official) {
    return false;
  }
  if (isOfficialCoinChallenge(challenge)) {
    return false;
  }
  if (!isCashLane(challenge)) {
    return false;
  }
  return Math.max(Number(challenge.buy_in_amount) || 0, 0) > 0;
}

export type OfficialCashJoinBlock =
  | { blocked: false; gate: 'open' }
  | { blocked: true; gate: Exclude<CashOfficialGate, 'open'>; copy: string };

const NOT_BLOCKED: OfficialCashJoinBlock = { blocked: false, gate: 'open' };

/**
 * The one call every paid-join surface makes. Anything that is not a house
 * cash Official passes straight through, so free rooms, user-created $ rooms,
 * host-funded bucks rooms, and Official Coin keep their existing join rules.
 */
export function officialCashJoinBlock(input: {
  challenge?: OfficialCashChallenge | null;
  dobStatus?: OfficialDobStatus | null;
  declaredRegion?: string | null;
  joinsLive?: boolean;
}): OfficialCashJoinBlock {
  if (!isOfficialCashChallenge(input.challenge)) {
    return NOT_BLOCKED;
  }
  const gate = cashOfficialGate({
    dobStatus: input.dobStatus,
    declaredRegion: input.declaredRegion,
    joinsLive: input.joinsLive,
  });
  if (cashOfficialJoinsAllowed(gate)) {
    return NOT_BLOCKED;
  }
  return {
    blocked: true,
    gate: gate as Exclude<CashOfficialGate, 'open'>,
    copy: cashOfficialJoinBlockedCopy(gate),
  };
}
