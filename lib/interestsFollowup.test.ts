import { describe, expect, it } from 'vitest';

import { chipDef, roomDef } from '@/lib/interestsCatalog';
import {
  PROOF_LABELS,
  clampQty,
  dropFollowUp,
  emptyFollowUp,
  extrasFromFollowUp,
  pruneFollowUps,
  savePayload,
  setQtyUnknown,
  setQtyValue,
  setRatingUnknown,
  setRatingValue,
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
  });
});
