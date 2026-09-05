import { describe, expect, it } from 'vitest';

import { copy } from '@/lib/copy';
import {
  canPerformCashAction,
  canSeeCashCta,
  challengeMoneyShape,
  createActionForShape,
  joinActionForShape,
} from '@/lib/geo/eligibility';
import {
  bucketForRegion,
  GEO_BUCKET_BY_REGION,
  GEO_UNAVAILABLE_COPY,
  USPS_REGIONS,
} from '@/lib/geo/regions';

describe('Wave-1 geo matrix', () => {
  it('has every USPS region plus DC and PR', () => {
    expect(USPS_REGIONS).toHaveLength(52);
    expect(Object.keys(GEO_BUCKET_BY_REGION).sort()).toEqual([...USPS_REGIONS].sort());
    expect(new Set(USPS_REGIONS).size).toBe(52);
  });

  it('uses the locked Allow / Limited / Blocked lists', () => {
    expect(bucketForRegion('TX')).toBe('allow');
    expect(bucketForRegion('dc')).toBe('allow');
    expect(bucketForRegion('NY')).toBe('limited');
    expect(bucketForRegion('WA')).toBe('limited');
    expect(bucketForRegion('AZ')).toBe('blocked');
    expect(bucketForRegion('PR')).toBe('blocked');
  });

  it('fails closed for unknown, empty, and international codes', () => {
    expect(bucketForRegion(null)).toBe('blocked');
    expect(bucketForRegion('')).toBe('blocked');
    expect(bucketForRegion('XX')).toBe('blocked');
    expect(bucketForRegion('ON')).toBe('blocked');
    expect(bucketForRegion('GB')).toBe('blocked');
  });
});

describe('challenge money shape', () => {
  it('treats coins as FREE even with an entry', () => {
    expect(
      challengeMoneyShape({ currency: 'coins', buy_in_amount: 10, prize_pool: 40 }),
    ).toBe('free');
  });

  it('maps host-funded cash and Official hybrid from live columns', () => {
    expect(
      challengeMoneyShape({
        currency: 'bucks',
        buy_in_amount: 0,
        prize_pool: 500,
        host_budget: 500,
      }),
    ).toBe('host');
    expect(
      challengeMoneyShape({
        currency: 'bucks',
        buy_in_amount: 10,
        host_budget: 500,
        prize_pool: 500,
      }),
    ).toBe('hybrid');
    expect(
      challengeMoneyShape({
        currency: 'bucks',
        buy_in_amount: 10,
        prize_pool: 20,
        host_budget: 0,
        creator_contribution: 0,
      }),
    ).toBe('pool');
    expect(challengeMoneyShape({ currency: 'bucks', is_callout: true, buy_in_amount: 5 })).toBe(
      'call',
    );
  });

  it('maps entry_cents / guarantee_cents without renaming live columns', () => {
    expect(
      challengeMoneyShape({
        currency: 'bucks',
        entry_cents: 1000,
        guarantee_cents: 50000,
      }),
    ).toBe('hybrid');
  });
});

describe('cash CTAs and actions', () => {
  it('keeps Coins and social CTAs visible in every bucket', () => {
    expect(canSeeCashCta('blocked', 'free')).toBe(true);
    expect(canSeeCashCta('limited', 'free')).toBe(true);
    expect(canSeeCashCta('allow', 'free')).toBe(true);
  });

  it('shows HOST only outside Blocked, HYBRID only in Allow', () => {
    expect(canSeeCashCta('allow', 'host')).toBe(true);
    expect(canSeeCashCta('limited', 'host')).toBe(true);
    expect(canSeeCashCta('blocked', 'host')).toBe(false);
    expect(canSeeCashCta('allow', 'hybrid')).toBe(true);
    expect(canSeeCashCta('limited', 'hybrid')).toBe(false);
    expect(canSeeCashCta('blocked', 'hybrid')).toBe(false);
    expect(canSeeCashCta('allow', 'pool')).toBe(false);
    expect(canSeeCashCta('allow', 'call')).toBe(false);
  });

  it('denies POOL and CALL nationwide and fails closed without a region', () => {
    expect(canPerformCashAction({ action: 'join_pool', declaredRegion: 'TX' }).reason).toBe(
      'product_off',
    );
    expect(canPerformCashAction({ action: 'call', declaredRegion: 'CA' }).allowed).toBe(false);
    expect(canPerformCashAction({ action: 'join_hybrid' }).reason).toBe('need_region');
    expect(canPerformCashAction({ action: 'join_host' }).reason).toBe('need_region');
    expect(canPerformCashAction({ action: 'join_hybrid' }).copy).toBe(GEO_UNAVAILABLE_COPY);
    expect(GEO_UNAVAILABLE_COPY).toBe(copy('geo.unavailable'));
  });

  it('allows HOST in Limited, HYBRID only in Allow, and denies cash in Blocked', () => {
    expect(canPerformCashAction({ action: 'join_host', declaredRegion: 'NY' }).allowed).toBe(true);
    expect(canPerformCashAction({ action: 'create_host', declaredRegion: 'WA' }).allowed).toBe(
      true,
    );
    expect(canPerformCashAction({ action: 'cashout', declaredRegion: 'NJ' }).allowed).toBe(true);
    expect(canPerformCashAction({ action: 'join_hybrid', declaredRegion: 'NY' }).allowed).toBe(
      false,
    );
    expect(canPerformCashAction({ action: 'join_hybrid', declaredRegion: 'TX' }).allowed).toBe(true);
    expect(canPerformCashAction({ action: 'join_host', declaredRegion: 'AZ' }).allowed).toBe(false);
    expect(canPerformCashAction({ action: 'join_hybrid', declaredRegion: 'AZ' }).reason).toBe(
      'blocked',
    );
  });

  it('denies when any effective region is stricter', () => {
    expect(
      canPerformCashAction({
        action: 'join_hybrid',
        declaredRegion: 'TX',
        preciseRegion: 'NY',
      }).allowed,
    ).toBe(false);
    expect(
      canPerformCashAction({
        action: 'join_host',
        declaredRegion: 'TX',
        preciseRegion: 'AZ',
      }).allowed,
    ).toBe(false);
    expect(
      canPerformCashAction({
        action: 'join_host',
        declaredRegion: 'TX',
        preciseRegion: 'NY',
      }).allowed,
    ).toBe(true);
  });

  it('maps shapes onto join/create actions', () => {
    expect(joinActionForShape('free')).toBeNull();
    expect(joinActionForShape('host')).toBe('join_host');
    expect(joinActionForShape('hybrid')).toBe('join_hybrid');
    expect(createActionForShape('host')).toBe('create_host');
    expect(createActionForShape('pool')).toBe('create_pool');
  });

  it('fails closed when the region is missing so a cash CTA is not shown', () => {
    expect(canSeeCashCta(bucketForRegion(null), 'host')).toBe(false);
    expect(canSeeCashCta(bucketForRegion(null), 'hybrid')).toBe(false);
    expect(canSeeCashCta(bucketForRegion(null), 'free')).toBe(true);
  });
});
