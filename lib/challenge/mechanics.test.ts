import { describe, expect, it } from 'vitest';

import {
  allowedMissesLine,
  joinCtaLabel,
  joinNeedsConfirmSheet,
  joinPayLine,
  refundBeforeStartLine,
  requiredProofLine,
} from '@/lib/challenge/mechanics';

const paid = {
  buy_in_amount: 10,
  currency: 'coins',
  prize_pool: 40,
  prize_structure: 'equal_split',
  proofs: [
    { id: 'pre', name: 'Pre-workout selfie', method: 'photo', required: true },
    { id: 'post', name: 'Post-workout selfie', method: 'photo', required: true },
    { id: 'hr', name: '30 minutes of elevated heart rate', method: 'hr', required: true },
  ],
  misses_allowed: 1,
  frequency: 'daily',
  challenge_type: 'consistency',
} as never;

describe('join confirmation copy', () => {
  it('opens the sheet for a fee, a prize, or an Official guarantee', () => {
    expect(joinNeedsConfirmSheet(paid)).toBe(true);
    expect(joinNeedsConfirmSheet({ buy_in_amount: 0, prize_pool: 0, is_official: true } as never)).toBe(true);
    expect(joinNeedsConfirmSheet({ buy_in_amount: 0, prize_pool: 0 } as never)).toBe(false);
  });

  it('states the fee, the refund, the misses, and the proofs', () => {
    expect(joinPayLine(paid)).toBe('You’re paying 10 credits');
    expect(joinCtaLabel(paid)).toBe('Join for 10 credits');
    expect(joinPayLine({ ...paid, buy_in_amount: 0 })).toBe('Host-funded — no entry fee');
    expect(joinCtaLabel({ ...paid, buy_in_amount: 0 })).toBe('Join — free');
    expect(refundBeforeStartLine(paid)).toMatch(/full refund/);
    expect(allowedMissesLine(paid)).toMatch(/miss 1/);
    expect(requiredProofLine(paid)).toMatch(/pre-workout selfie/i);
    expect(requiredProofLine(paid)).toMatch(/heart rate/);
  });
});
