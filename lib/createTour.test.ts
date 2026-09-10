import { describe, expect, it } from 'vitest';

import { ADVANCED_CREATE_TOUR, SIMPLE_CREATE_TOUR, createTourSteps } from '@/lib/createTour';

function joinedCopy(steps: typeof SIMPLE_CREATE_TOUR) {
  return steps
    .map((step) => [step.title, step.body, step.titleCash, step.bodyCash].filter(Boolean).join(' '))
    .join('\n');
}

describe('create tours', () => {
  it('starts Simple on What and puts money last', () => {
    const ids = SIMPLE_CREATE_TOUR.map((step) => step.id);
    expect(ids[0]).toBe('simple-title');
    expect(ids.slice(-3)).toEqual(['simple-currency', 'simple-buyin', 'simple-advanced']);
    expect(SIMPLE_CREATE_TOUR[0]?.title).toBe('What');
    expect(SIMPLE_CREATE_TOUR.find((step) => step.id === 'simple-buyin')).toMatchObject({
      title: 'Amount',
      body: 'Coins: each person pays this to join.',
      titleCash: 'Prize',
      bodyCash: 'You fund this prize. Participants do not buy in.',
    });
    expect(ids[0]).not.toBe('simple-buyin');
    expect(joinedCopy(SIMPLE_CREATE_TOUR)).not.toMatch(/Bucks/i);
    expect(joinedCopy(SIMPLE_CREATE_TOUR)).not.toMatch(/player-pool/i);
    expect(joinedCopy(SIMPLE_CREATE_TOUR)).not.toMatch(/each task has its own cadence/i);
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
