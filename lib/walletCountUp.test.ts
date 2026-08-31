import { describe, expect, it } from 'vitest';

import {
  headerCountUpPlan,
  headerLastShown,
  headerShouldCountRefund,
  markHeaderCountUpDone,
  resetHeaderCountUpForTests,
} from '@/lib/walletCountUp';
import { asWalletReceiptRow, walletReceiptHref, walletReceiptHeadline } from '@/lib/walletReceipt';

describe('header count-up', () => {
  it('fires once per new credit, not on every Home remount', () => {
    resetHeaderCountUpForTests();
    expect(headerLastShown(10, 14)).toBe(10);
    expect(
      headerCountUpPlan({ userId: 'u1', currency: 'coins', lastShown: 10, current: 14 }),
    ).toBe('count');
    markHeaderCountUpDone('u1', 'coins', 14);
    expect(
      headerCountUpPlan({ userId: 'u1', currency: 'coins', lastShown: 10, current: 14 }),
    ).toBe('snap');
    expect(
      headerCountUpPlan({ userId: 'u1', currency: 'coins', lastShown: 14, current: 14 }),
    ).toBe('snap');
  });

  it('counts coins and bucks separately after a refund credit', () => {
    resetHeaderCountUpForTests();
    expect(headerShouldCountRefund({ lastShown: 5, current: 10, credit: 5 })).toBe(true);
    expect(
      headerCountUpPlan({ userId: 'u1', currency: 'bucks', lastShown: 2, current: 7 }),
    ).toBe('count');
    markHeaderCountUpDone('u1', 'bucks', 7);
    expect(
      headerCountUpPlan({ userId: 'u1', currency: 'coins', lastShown: 2, current: 7 }),
    ).toBe('count');
  });
});

describe('wallet settlement receipt', () => {
  it('deep-links a settled row to that challenge Overview', () => {
    expect(String(walletReceiptHref('abc-1'))).toBe('/challenges/abc-1?tab=overview');
    expect(String(walletReceiptHref('abc-1'))).not.toContain('board');
    expect(walletReceiptHref('   ')).toBeNull();
  });

  it('lists a pre-start refund as Refund · title', () => {
    const row = asWalletReceiptRow({
      id: 'led-1',
      challenge_id: 'c1',
      currency: 'coins',
      amount: 10,
      entry_type: 'refund_pre_start',
      reason: 'refund_pre_start',
      created_at: '2026-08-31T16:00:00.000Z',
      title: 'Challenge',
      task: 'Daily Prayer',
    });
    expect(row.refund).toBe(true);
    expect(row.headline).toBe('Refund · Daily Prayer');
    expect(row.amount).toBe(10);
    expect(walletReceiptHeadline({ entryType: 'distribute_win', title: 'Official Weekly', place: 1 })).toBe(
      'Official Weekly · 1st',
    );
    expect(walletReceiptHeadline({ entryType: 'distribute_win', title: 'Workout Group #2' })).toBe(
      'Workout Group #2 · Prize',
    );
  });
});
