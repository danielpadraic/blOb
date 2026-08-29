import { describe, expect, it } from 'vitest';

import { bucksJoinCta, entryFeeCtaLabel, INSUFFICIENT_JOIN_COPY } from '@/lib/joinCta';

describe('join CTA', () => {
  it('prints $1 Entry Fee on the idle cash button', () => {
    expect(entryFeeCtaLabel(1)).toBe('$1 Entry Fee');
    const cta = bucksJoinCta({
      currency: 'bucks',
      buyIn: 1,
      wallet: 0,
      hasProfile: true,
    });
    expect(cta.joinLabel).toBe('$1 Entry Fee');
    expect(cta.needsTopUp).toBe(true);
    expect(cta.joinLabel).not.toMatch(/add money/i);
    expect(INSUFFICIENT_JOIN_COPY).toBe('You need to add money to join.');
  });
});
