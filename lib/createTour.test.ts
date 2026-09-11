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

  it('keeps Advanced on decisions that change the product', () => {
    const ids = ADVANCED_CREATE_TOUR.map((step) => step.id);
    expect(ids).toEqual([
      'adv-lane',
      'adv-title',
      'adv-visibility',
      'adv-scoring',
      'adv-starts',
      'adv-duration',
      'adv-prize',
      'adv-currency',
      'adv-buyin',
      'adv-limits',
      'adv-misses',
      'adv-proofs',
      'adv-review',
    ]);
    expect(ids).not.toContain('adv-start-from');
    expect(ids).not.toContain('adv-schedule');
    expect(joinedCopy(ADVANCED_CREATE_TOUR)).not.toMatch(/Bucks/i);
    expect(joinedCopy(ADVANCED_CREATE_TOUR)).not.toMatch(/Host-scored/i);
    expect(joinedCopy(ADVANCED_CREATE_TOUR)).not.toMatch(/player-pool/i);
    expect(ADVANCED_CREATE_TOUR.every((step) => typeof step.wizardStep === 'number')).toBe(true);
  });
});
