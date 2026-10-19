import { describe, expect, it } from 'vitest';

import { cashOutBlockReason } from '@/lib/cashOut';

describe('cash out gate', () => {
  it('keeps promo and credit in the app and requires $25 cash', () => {
    expect(cashOutBlockReason({ bucks: 0, credits: 10 })).toMatch(/Promo/);
    expect(cashOutBlockReason({ bucks: 24.99, credits: 0 })).toMatch(/\$25/);
    expect(cashOutBlockReason({ bucks: 25, credits: 40 })).toBeNull();
  });
});
