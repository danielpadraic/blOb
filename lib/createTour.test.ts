import { describe, expect, it } from 'vitest';

import { ADVANCED_CREATE_TOUR, SIMPLE_CREATE_TOUR, createTourSteps } from '@/lib/createTour';

function joinedCopy(steps: typeof SIMPLE_CREATE_TOUR) {
  return steps
    .map((step) => [step.title, step.body, step.titleCash, step.bodyCash].filter(Boolean).join(' '))
    .join('\n');
}

describe('create tours', () => {
  it('caps Simple at four cards that skip the title field and footer', () => {
    const ids = SIMPLE_CREATE_TOUR.map((step) => step.id);
    expect(ids).toEqual(['simple-type', 'simple-duration', 'simple-proof', 'simple-visibility']);
    expect(ids).not.toContain('simple-title');
    expect(ids).not.toContain('simple-advanced');
    expect(SIMPLE_CREATE_TOUR).toHaveLength(4);
    expect(joinedCopy(SIMPLE_CREATE_TOUR)).not.toMatch(/Bucks/i);
    expect(joinedCopy(SIMPLE_CREATE_TOUR)).not.toMatch(/player-pool/i);
    expect(createTourSteps('simple')).toBe(SIMPLE_CREATE_TOUR);
  });

  it('caps Advanced at four cards that skip the title field and footer', () => {
    const ids = ADVANCED_CREATE_TOUR.map((step) => step.id);
    expect(ids).toEqual(['adv-lane', 'adv-scoring', 'adv-duration', 'adv-proofs']);
    expect(ids).not.toContain('adv-title');
    expect(ids).not.toContain('adv-review');
    expect(ADVANCED_CREATE_TOUR).toHaveLength(4);
    expect(joinedCopy(ADVANCED_CREATE_TOUR)).not.toMatch(/Bucks/i);
    expect(joinedCopy(ADVANCED_CREATE_TOUR)).not.toMatch(/Host-scored/i);
    expect(joinedCopy(ADVANCED_CREATE_TOUR)).not.toMatch(/player-pool/i);
    expect(ADVANCED_CREATE_TOUR.every((step) => typeof step.wizardStep === 'number')).toBe(true);
  });
});
