import { describe, expect, it } from 'vitest';

import {
  asSettlementRow,
  availableHeadline,
  cashOutBannerAction,
  cashOutSummary,
  receiptHoldLine,
  settlementChipLabel,
} from '@/lib/wallet/settlement';

describe('wallet settlement status', () => {
  it('keeps a prize in the wallet until cash-out is a live rail', () => {
    const row = asSettlementRow({
      id: '1',
      challenge_title: 'Workout Group #2',
      currency: 'bucks',
      amount: 40,
      entry_type: 'distribute_win',
      created_at: '2026-10-26T15:00:00.000Z',
      fee_cents: 0,
    });
    expect(row?.title).toBe('Workout Group #2');
    expect(row?.kind).toBe('Prize');
    expect(row?.chip).toBe('in_wallet');
    expect(settlementChipLabel('in_wallet')).toBe('Settled · In wallet');
    expect(row && receiptHoldLine(row)).toBe('This amount is in your blOb wallet.');
    expect(cashOutSummary(row ? [row] : [])).toEqual({ available: 0, pending: 40 });
    expect(availableHeadline(0, 40)).toBe('$0.00 — settlements pending');
  });

  it('does not offer a button when the address is already saved or the cash is under $25', () => {
    expect(cashOutBannerAction({ bucks: 10, pending: 0, hasAddress: false })).toBeNull();
    expect(cashOutBannerAction({ bucks: 40, pending: 0, hasAddress: true })).toBeNull();
    expect(cashOutBannerAction({ bucks: 0, pending: 40, hasAddress: false })?.href).toBe('/profile/account');
  });

  it('shows a cashed-out row without a pending balance', () => {
    const row = asSettlementRow({
      id: '2',
      title: 'Weekly Fitness Challenge',
      currency: 'bucks',
      amount: 25,
      entry_type: 'cash_out',
      created_at: '2026-10-26T15:00:00.000Z',
    });
    expect(row?.chip).toBe('cashed_out');
    expect(cashOutSummary(row ? [row] : []).pending).toBe(0);
  });
});
