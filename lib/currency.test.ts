import { describe, expect, it } from 'vitest';

import { formatCashPrizeAmount } from '@/lib/currency';

describe('cash prize amount', () => {
  it('prints $5,000 without cents or a Prize suffix', () => {
    expect(formatCashPrizeAmount(5000)).toBe('$5,000');
    expect(formatCashPrizeAmount(5000.5)).toBe('$5,000.50');
    expect(formatCashPrizeAmount(0)).toBe('$0');
  });
});
