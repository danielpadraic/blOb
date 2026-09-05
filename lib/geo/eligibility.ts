import { asWalletCurrency } from '@/lib/currency';
import {
  bucketForRegion,
  GEO_UNAVAILABLE_COPY,
  normalizeRegion,
  type CashAction,
  type GeoBucket,
} from '@/lib/geo/regions';

export type MoneyShape = 'free' | 'host' | 'hybrid' | 'pool' | 'call';

export type MoneyShapeInput = {
  currency?: string | null;
  buy_in_amount?: number | null;
  entry_fee?: number | null;
  entry_cents?: number | null;
  prize_pool?: number | null;
  prize_amount?: number | null;
  prize_cents?: number | null;
  host_budget?: number | null;
  creator_contribution?: number | null;
  guarantee_cents?: number | null;
  host_funded?: boolean | null;
  funding_model?: string | null;
  is_callout?: boolean | null;
};

export type CashGateResult = {
  allowed: boolean;
  bucket: GeoBucket;
  reason: string;
  copy: string;
};

function firstMoney(
  dollars: Array<number | null | undefined>,
  cents: Array<number | null | undefined>,
): number {
  for (const value of dollars) {
    if (value == null) {
      continue;
    }
    const amount = Number(value);
    if (Number.isFinite(amount)) {
      return Math.max(amount, 0);
    }
  }
  for (const value of cents) {
    if (value == null) {
      continue;
    }
    const amount = Number(value);
    if (Number.isFinite(amount)) {
      return Math.max(amount, 0) / 100;
    }
  }
  return 0;
}

function isCashCurrency(value: string | null | undefined): boolean {
  return asWalletCurrency(value) === 'bucks';
}

/** Detect FREE / HOST / HYBRID / POOL / CALL from live challenge columns. */
export function challengeMoneyShape(row: MoneyShapeInput | null | undefined): MoneyShape {
  if (!row) {
    return 'free';
  }
  const cash = isCashCurrency(row.currency);
  if (row.is_callout && cash) {
    return 'call';
  }
  if (!cash) {
    return 'free';
  }
  const entry = firstMoney([row.buy_in_amount, row.entry_fee], [row.entry_cents]);
  const prize = firstMoney([row.prize_pool, row.prize_amount], [row.prize_cents]);
  const guarantee = firstMoney(
    [row.host_budget, row.creator_contribution],
    [row.guarantee_cents],
  );
  const postedGuarantee = guarantee > 0 || (row.host_funded === true && prize > 0);
  if (entry <= 0 && prize <= 0 && !postedGuarantee) {
    return 'free';
  }
  if (entry > 0 && !postedGuarantee) {
    return 'pool';
  }
  if (entry > 0 && postedGuarantee) {
    return 'hybrid';
  }
  return 'host';
}

export function joinActionForShape(shape: MoneyShape): CashAction | null {
  if (shape === 'host') {
    return 'join_host';
  }
  if (shape === 'hybrid') {
    return 'join_hybrid';
  }
  if (shape === 'pool') {
    return 'join_pool';
  }
  if (shape === 'call') {
    return 'call';
  }
  return null;
}

export function createActionForShape(shape: MoneyShape): CashAction | null {
  if (shape === 'host') {
    return 'create_host';
  }
  if (shape === 'hybrid') {
    return 'create_hybrid';
  }
  if (shape === 'pool') {
    return 'create_pool';
  }
  if (shape === 'call') {
    return 'call';
  }
  return null;
}

export function canSeeCashCta(bucket: GeoBucket, shape: MoneyShape): boolean {
  if (shape === 'free') {
    return true;
  }
  if (shape === 'host') {
    return bucket !== 'blocked';
  }
  if (shape === 'hybrid') {
    return bucket === 'allow';
  }
  return false;
}

function isHybridAction(action: CashAction): boolean {
  return action === 'join_hybrid' || action === 'create_hybrid';
}

function isProductOffAction(action: CashAction): boolean {
  return action === 'create_pool' || action === 'join_pool' || action === 'call';
}

function isHostLikeAction(action: CashAction): boolean {
  return action === 'join_host' || action === 'create_host' || action === 'cashout';
}

function combineBuckets(regions: Array<string | null | undefined>): {
  bucket: GeoBucket;
  hasRegion: boolean;
} {
  const codes = [...new Set(regions.map(normalizeRegion).filter((code): code is string => Boolean(code)))];
  if (codes.length === 0) {
    return { bucket: 'blocked', hasRegion: false };
  }
  let limited = false;
  for (const code of codes) {
    const bucket = bucketForRegion(code);
    if (bucket === 'blocked') {
      return { bucket: 'blocked', hasRegion: true };
    }
    if (bucket === 'limited') {
      limited = true;
    }
  }
  return { bucket: limited ? 'limited' : 'allow', hasRegion: true };
}

export function canPerformCashAction(input: {
  action: CashAction;
  declaredRegion?: string | null;
  preciseRegion?: string | null;
}): CashGateResult {
  const combined = combineBuckets([input.declaredRegion, input.preciseRegion]);
  const copy = GEO_UNAVAILABLE_COPY;
  if (isProductOffAction(input.action)) {
    return { allowed: false, bucket: combined.bucket, reason: 'product_off', copy };
  }
  if (!combined.hasRegion) {
    return { allowed: false, bucket: 'blocked', reason: 'need_region', copy };
  }
  if (combined.bucket === 'blocked') {
    return { allowed: false, bucket: 'blocked', reason: 'blocked', copy };
  }
  if (combined.bucket === 'limited' && isHybridAction(input.action)) {
    return { allowed: false, bucket: 'limited', reason: 'limited', copy };
  }
  if (combined.bucket === 'limited' && !isHostLikeAction(input.action) && !isHybridAction(input.action)) {
    return { allowed: false, bucket: 'limited', reason: 'limited', copy };
  }
  return { allowed: true, bucket: combined.bucket, reason: 'ok', copy };
}

export function isGeoGateDeny(error: unknown): boolean {
  const raw =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message ?? '')
      : String(error ?? '');
  const token = raw.trim().toLowerCase();
  if (
    token === 'blocked' ||
    token === 'limited' ||
    token === 'need_region' ||
    token === 'product_off' ||
    token === 'geo_blocked'
  ) {
    return true;
  }
  const blob = raw.toLowerCase();
  if (blob.includes('isn’t available in your state') || blob.includes("isn't available in your state")) {
    return true;
  }
  return ['need_region', 'product_off', 'geo_blocked', 'geo_restricted'].some((part) => blob.includes(part));
}
