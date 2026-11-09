import { describe, expect, it } from 'vitest';

import { settledReceiptKind, settledReceiptTitle } from '@/lib/walletReceipt';

describe('settled receipt title', () => {
  it('names the real challenge with Prize or Refund, never this challenge', () => {
    expect(settledReceiptTitle({ title: 'Pinnacle Core September', status: 'settled' })).toBe(
      'Pinnacle Core September · Prize',
    );
    expect(settledReceiptTitle({ title: 'Pinnacle Core September', status: 'cancelled' })).toBe(
      'Pinnacle Core September · Refund',
    );
    expect(settledReceiptTitle({ title: 'this challenge', status: 'settled' })).not.toMatch(
      /this challenge/i,
    );
    expect(settledReceiptKind('cancelled_underfilled')).toBe('Refund');
  });
});
