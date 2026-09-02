import { describe, expect, it } from 'vitest';

import { chipDef, roomDef } from '@/lib/interestsCatalog';
import {
  PROOF_LABELS,
  activityCardBlocked,
  clampQty,
  dropFollowUp,
  emptyFollowUp,
  extrasFromFollowUp,
  pruneFollowUps,
  savePayload,
  setQtyPeriod,
  setQtyUnknown,
  setQtyValue,
  setRatingUnknown,
  setRatingValue,
  toggleAllProofs,
  toggleProof,
} from '@/lib/interestsFollowup';
import { toggleChipStance } from '@/lib/interests';

describe('catalog slice 2', () => {
  it('sets DUPR on pickleball, miles on running, pages on reading, hours on fasting', () => {
    expect(chipDef('sports', 'pickleball')?.ratingKind).toBe('dupr');
    expect(chipDef('health_fitness', 'running')?.qtyKind).toBe('miles_outing');
    expect(chipDef('health_fitness', 'lifting')?.allowsIndoorOutdoor).toBe(true);
    expect(chipDef('health_fitness', 'lifting')?.qtyKind).toBe('sessions_week');
    expect(chipDef('personal_development', 'reading')?.qtyKind).toBe('pages_week');
    expect(chipDef('personal_development', 'fasting')?.qtyKind).toBe('fasting_hours');
    expect(chipDef('personal_development', 'academics')?.allowsIndoorOutdoor).toBe(false);
    expect(chipDef('personal_development', 'work')?.allowsIndoorOutdoor).toBe(false);
    expect(chipDef('esports', 'league')?.allowsIndoorOutdoor).toBe(false);
    expect(chipDef('esports', 'league')?.ratingKind).toBe('mmr');
    expect(chipDef('sports', 'pickleball')?.qtyKind).toBe('sessions_week');
    expect(chipDef('esports', 'league')?.qtyKind).toBe('sessions_week');
    expect(chipDef('relationships', 'family')?.qtyKind).toBe('sessions_week');
  });

  it('never labels proof as Health', () => {
    expect(PROOF_LABELS.fitness_tracker).toBe('Fitness Tracker');
    expect(Object.values(PROOF_LABELS).join(' ')).not.toMatch(/\bHealth\b/);
  });
});

describe('follow-up prune', () => {
  it('drops extras when a chip is turned off', () => {
    const on = toggleChipStance({}, 'pickleball');
    const withFollow = { pickleball: emptyFollowUp() };
    const off = toggleChipStance(on, 'pickleball');
    expect(pruneFollowUps(withFollow, off)).toEqual({});
    expect(dropFollowUp(withFollow, 'pickleball').pickleball).toBeUndefined();
  });
});

describe('rating unknown', () => {
  it('saves pickleball Unknown with no number', () => {
    const followUp = setRatingUnknown(emptyFollowUp(), true);
    const payload = savePayload({
      followUp,
      slug: 'pickleball',
      ratingKind: 'dupr',
      qtyKind: null,
      allowsIndoorOutdoor: true,
    });
    expect(payload.rating_unknown).toBe(true);
    expect(payload.rating_value).toBeNull();
  });

  it('clears unknown when a number is typed', () => {
    const unknown = setRatingUnknown(emptyFollowUp(), true);
    const numbered = setRatingValue(unknown, '4.2');
    expect(numbered.ratingUnknown).toBe(false);
    expect(numbered.ratingValue).toBe(4.2);
  });
});

describe('qty pair', () => {
  it('clamps pages/week and keeps current separate from goal', () => {
    expect(clampQty('pages_week', 500)).toBe(200);
    expect(clampQty('miles_outing', -2)).toBe(0);
    const next = setQtyValue(emptyFollowUp(), 'pages_week', 'currentQty', 12);
    const both = setQtyValue(next, 'pages_week', 'goalQty', 40);
    expect(both.currentQty).toBe(12);
    expect(both.goalQty).toBe(40);
    expect(setQtyUnknown(both, true).currentQty).toBeNull();
  });
});

describe('extras', () => {
  it('puts title MMR in extras, not a second health record', () => {
    const followUp = { ...emptyFollowUp(), mmrLabel: 'Immortal 3' };
    const extras = extrasFromFollowUp({
      followUp,
      slug: 'valorant',
      ratingKind: 'mmr',
      qtyKind: null,
    });
    expect(extras).toEqual({ mmr_label: 'Immortal 3' });
    expect(extras).not.toHaveProperty('health');
  });

  it('omits indoor when the catalog forbids it', () => {
    const followUp = { ...emptyFollowUp(), indoorOutdoor: 'indoor' as const };
    const payload = savePayload({
      followUp,
      slug: 'league',
      ratingKind: 'mmr',
      qtyKind: null,
      allowsIndoorOutdoor: false,
    });
    expect(payload.indoor_outdoor).toBeNull();
  });
});

describe('eSports indoor', () => {
  it('has no indoor flag on League', () => {
    expect(roomDef('esports').chips.every((chip) => !chip.allowsIndoorOutdoor)).toBe(true);
    expect(chipDef('health_fitness', 'running')?.allowsIndoorOutdoor).toBe(true);
  });
});

describe('activity card required fields', () => {
  it('soft-blocks Running until current, goal, period, and place are set', () => {
    const chip = chipDef('health_fitness', 'running')!;
    expect(activityCardBlocked({ chip, followUp: emptyFollowUp() })).toMatch(/how often you run/i);
    const filled = {
      ...emptyFollowUp(),
      currentQty: 3,
      goalQty: 5,
      qtyPeriod: 'week' as const,
      indoorOutdoor: 'outdoor' as const,
    };
    expect(activityCardBlocked({ chip, followUp: filled })).toBeNull();
  });

  it('allows pickleball Unknown DUPR with frequency and place', () => {
    const chip = chipDef('sports', 'pickleball')!;
    const followUp = {
      ...setRatingUnknown(emptyFollowUp(), true),
      currentQty: 2,
      goalQty: 3,
      qtyPeriod: 'week' as const,
      indoorOutdoor: 'both' as const,
    };
    expect(activityCardBlocked({ chip, followUp })).toBeNull();
  });

  it('keeps Work occupation and employer on the card', () => {
    const chip = chipDef('personal_development', 'work')!;
    expect(
      activityCardBlocked({ chip, followUp: emptyFollowUp(), occupation: '', employer: 'Acme' }),
    ).toMatch(/occupation and employer/i);
  });
});

describe('proofs and period', () => {
  it('stores Photo + Fitness Tracker, or all five, and never Health', () => {
    const two = toggleProof(toggleProof(emptyFollowUp(), 'photo'), 'fitness_tracker');
    expect(savePayload({
      followUp: two,
      slug: 'running',
      ratingKind: null,
      qtyKind: 'miles_outing',
      allowsIndoorOutdoor: true,
    }).preferred_proofs).toEqual(['photo', 'fitness_tracker']);
    const all = toggleAllProofs(emptyFollowUp());
    expect(all.preferredProofs).toHaveLength(5);
    expect(PROOF_LABELS.fitness_tracker).not.toMatch(/health/i);
  });

  it('keeps Current and Goal with a period', () => {
    const next = setQtyPeriod(setQtyValue(emptyFollowUp(), 'miles_outing', 'currentQty', 4), 'week');
    expect(next.qtyPeriod).toBe('week');
    expect(next.currentQty).toBe(4);
  });
});
