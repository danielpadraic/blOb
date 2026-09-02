import { describe, expect, it } from 'vitest';

import { chipDef, QTY_PERIODS, QTY_PERIOD_LABELS, roomDef } from '@/lib/interestsCatalog';
import {
  PROOF_LABELS,
  activityCardBlocked,
  clampQty,
  currentVolumeLabel,
  dropFollowUp,
  emptyFollowUp,
  extrasFromFollowUp,
  followUpFromRow,
  goalVolumeLabel,
  pruneFollowUps,
  qtyUnitLabel,
  savePayload,
  setQtyPeriod,
  setQtyUnknown,
  setQtyValue,
  setRatingUnknown,
  setRatingValue,
  toggleDietGoal,
  toggleDietStyle,
} from '@/lib/interestsFollowup';
import { toggleChipStance } from '@/lib/interests';

describe('catalog copy pass', () => {
  it('sets DUPR on pickleball, miles on running, laps on swimming, sessions on lifting and rowing', () => {
    expect(chipDef('sports', 'pickleball')?.ratingKind).toBe('dupr');
    expect(chipDef('health_fitness', 'running')?.qtyKind).toBe('miles_outing');
    expect(chipDef('health_fitness', 'running')?.allowsIndoorOutdoor).toBe(false);
    expect(chipDef('health_fitness', 'lifting')?.allowsIndoorOutdoor).toBe(false);
    expect(chipDef('health_fitness', 'lifting')?.qtyKind).toBe('sessions_week');
    expect(chipDef('health_fitness', 'swimming')?.qtyKind).toBe('laps');
    expect(chipDef('health_fitness', 'rowing')?.qtyKind).toBe('sessions_week');
    expect(chipDef('personal_development', 'reading')?.qtyKind).toBe('pages_week');
    expect(chipDef('personal_development', 'fasting')?.qtyKind).toBe('fasting_hours');
    expect(chipDef('personal_development', 'academics')?.allowsIndoorOutdoor).toBe(false);
    expect(chipDef('personal_development', 'work')?.allowsIndoorOutdoor).toBe(false);
    expect(chipDef('esports', 'league')?.allowsIndoorOutdoor).toBe(false);
    expect(chipDef('esports', 'league')?.ratingKind).toBe('mmr');
    expect(chipDef('sports', 'pickleball')?.qtyKind).toBe('sessions_week');
    expect(chipDef('sports', 'pickleball')?.allowsIndoorOutdoor).toBe(false);
    expect(chipDef('esports', 'league')?.qtyKind).toBe('sessions_week');
    expect(chipDef('relationships', 'family')?.qtyKind).toBe('sessions_week');
  });

  it('adds Diet & Nutrition after Mobility and does not merge Mobility into Yoga', () => {
    const slugs = roomDef('health_fitness').chips.map((chip) => chip.slug);
    expect(slugs).toContain('mobility');
    expect(slugs).toContain('yoga');
    expect(slugs).toContain('diet_nutrition');
    expect(chipDef('health_fitness', 'diet_nutrition')?.label).toBe('Diet & Nutrition');
    expect(chipDef('health_fitness', 'mobility')?.label).toBe('Mobility');
    expect(slugs.indexOf('diet_nutrition')).toBeGreaterThan(slugs.indexOf('mobility'));
    expect(slugs.indexOf('diet_nutrition')).toBeLessThan(slugs.indexOf('other'));
  });

  it('never labels proof as Health', () => {
    expect(PROOF_LABELS.fitness_tracker).toBe('Fitness Tracker');
    expect(Object.values(PROOF_LABELS).join(' ')).not.toMatch(/\bHealth\b/);
  });

  it('uses sentence labels and profile units, laps for swimming, sessions for lifting', () => {
    expect(currentVolumeLabel(chipDef('health_fitness', 'running')!)).toBe('I currently run');
    expect(goalVolumeLabel(chipDef('health_fitness', 'running')!)).toBe('My goal is to run');
    expect(currentVolumeLabel(chipDef('health_fitness', 'lifting')!)).toBe('I currently lift');
    expect(qtyUnitLabel('miles_outing', 'running', 'imperial')).toBe('mi');
    expect(qtyUnitLabel('miles_outing', 'running', 'metric')).toBe('km');
    expect(qtyUnitLabel('laps', 'swimming', 'imperial')).toBe('laps');
    expect(qtyUnitLabel('sessions_week', 'lifting', 'imperial')).toBe('sessions');
    expect(qtyUnitLabel('sessions_week', 'rowing', 'imperial')).toBe('sessions');
  });

  it('keeps four period chips with the full Per day/week/month/year labels', () => {
    expect([...QTY_PERIODS]).toEqual(['day', 'week', 'month', 'year']);
    expect(QTY_PERIOD_LABELS.day).toBe('Per day');
    expect(QTY_PERIOD_LABELS.week).toBe('Per week');
    expect(QTY_PERIOD_LABELS.month).toBe('Per month');
    expect(QTY_PERIOD_LABELS.year).toBe('Per year');
    expect(Object.values(QTY_PERIOD_LABELS).join(' ')).not.toMatch(/sessi/i);
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
      room: 'sports',
    });
    expect(payload.rating_unknown).toBe(true);
    expect(payload.rating_value).toBeNull();
    expect(payload.indoor_outdoor).toBeNull();
  });

  it('clears unknown when a number is typed', () => {
    const unknown = setRatingUnknown(emptyFollowUp(), true);
    const numbered = setRatingValue(unknown, '4.2');
    expect(numbered.ratingUnknown).toBe(false);
    expect(numbered.ratingValue).toBe(4.2);
  });
});

describe('qty pair', () => {
  it('clamps pages/week and copies current onto an unset goal', () => {
    expect(clampQty('pages_week', 500)).toBe(200);
    expect(clampQty('miles_outing', -2)).toBe(0);
    const next = setQtyValue(emptyFollowUp(), 'pages_week', 'currentQty', 12);
    expect(next.currentQty).toBe(12);
    expect(next.goalQty).toBe(12);
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

  it('stores sports highest level and diet extras', () => {
    const pickle = extrasFromFollowUp({
      followUp: { ...emptyFollowUp(), highestLevel: 'college' },
      slug: 'pickleball',
      ratingKind: 'dupr',
      qtyKind: 'sessions_week',
      room: 'sports',
    });
    expect(pickle.highest_level).toBe('college');
    const diet = extrasFromFollowUp({
      followUp: {
        ...emptyFollowUp(),
        dietGoals: ['weight_loss', 'other'],
        dietStyles: ['high_protein'],
        otherGoalText: 'Cut for a meet',
      },
      slug: 'diet_nutrition',
      ratingKind: null,
      qtyKind: null,
    });
    expect(diet).toEqual({
      goals: ['weight_loss', 'other'],
      diet: ['high_protein'],
      other_goal_text: 'Cut for a meet',
    });
  });

  it('never writes indoor from this UI', () => {
    const followUp = { ...emptyFollowUp(), indoorOutdoor: 'indoor' as const };
    const payload = savePayload({
      followUp,
      slug: 'running',
      ratingKind: null,
      qtyKind: 'miles_outing',
      allowsIndoorOutdoor: true,
      room: 'health_fitness',
    });
    expect(payload.indoor_outdoor).toBeNull();
  });
});

describe('eSports indoor', () => {
  it('has no indoor flag on League or Running', () => {
    expect(roomDef('esports').chips.every((chip) => !chip.allowsIndoorOutdoor)).toBe(true);
    expect(roomDef('sports').chips.every((chip) => !chip.allowsIndoorOutdoor)).toBe(true);
    expect(chipDef('health_fitness', 'running')?.allowsIndoorOutdoor).toBe(false);
  });
});

describe('activity card required fields', () => {
  it('soft-blocks Running until current and period are set, and does not require indoor or goal', () => {
    const chip = chipDef('health_fitness', 'running')!;
    expect(activityCardBlocked({ chip, followUp: emptyFollowUp(), room: 'health_fitness' })).toMatch(
      /how often you run/i,
    );
    const currentOnly = {
      ...emptyFollowUp(),
      currentQty: 3,
      qtyPeriod: 'week' as const,
    };
    expect(activityCardBlocked({ chip, followUp: currentOnly, room: 'health_fitness' })).toBeNull();
  });

  it('allows pickleball Unknown DUPR with play frequency and highest level, no place or goal', () => {
    const chip = chipDef('sports', 'pickleball')!;
    const missingLevel = {
      ...setRatingUnknown(emptyFollowUp(), true),
      currentQty: 2,
      qtyPeriod: 'week' as const,
    };
    expect(activityCardBlocked({ chip, followUp: missingLevel, room: 'sports' })).toMatch(/highest level/i);
    const followUp = {
      ...missingLevel,
      highestLevel: 'recreational' as const,
    };
    expect(activityCardBlocked({ chip, followUp, room: 'sports' })).toBeNull();
  });

  it('requires both Diet & Nutrition multi-selects', () => {
    const chip = chipDef('health_fitness', 'diet_nutrition')!;
    expect(activityCardBlocked({ chip, followUp: emptyFollowUp(), room: 'health_fitness' })).toMatch(
      /nutrition goals/i,
    );
    const one = toggleDietGoal(emptyFollowUp(), 'weight_loss');
    expect(activityCardBlocked({ chip, followUp: one, room: 'health_fitness' })).toMatch(/current diet/i);
    const both = toggleDietStyle(one, 'balanced');
    expect(activityCardBlocked({ chip, followUp: both, room: 'health_fitness' })).toBeNull();
  });

  it('keeps Work occupation and employer on the card', () => {
    const chip = chipDef('personal_development', 'work')!;
    expect(
      activityCardBlocked({ chip, followUp: emptyFollowUp(), occupation: '', employer: 'Acme' }),
    ).toMatch(/occupation and employer/i);
  });
});

describe('proofs and period', () => {
  it('does not require proof on an Activity Card', () => {
    const chip = chipDef('health_fitness', 'running')!;
    const followUp = {
      ...emptyFollowUp(),
      currentQty: 3,
      goalQty: 5,
      qtyPeriod: 'week' as const,
    };
    expect(activityCardBlocked({ chip, followUp, room: 'health_fitness' })).toBeNull();
    expect(PROOF_LABELS.fitness_tracker).not.toMatch(/health/i);
  });

  it('keeps Current and Goal with a period and coerces old session rows to week', () => {
    const next = setQtyPeriod(setQtyValue(emptyFollowUp(), 'miles_outing', 'currentQty', 4), 'week');
    expect(next.qtyPeriod).toBe('week');
    expect(next.currentQty).toBe(4);
    expect(followUpFromRow({ qty_period: 'session', extras: {} }).qtyPeriod).toBe('week');
  });

  it('does not save a sports goal slider', () => {
    const payload = savePayload({
      followUp: { ...emptyFollowUp(), currentQty: 2, goalQty: 9, qtyPeriod: 'week', highestLevel: 'college' },
      slug: 'pickleball',
      ratingKind: 'dupr',
      qtyKind: 'sessions_week',
      allowsIndoorOutdoor: false,
      room: 'sports',
    });
    expect(payload.current_qty).toBe(2);
    expect(payload.goal_qty).toBeNull();
    expect(payload.goal_qty_period).toBeNull();
    expect(payload.extras.highest_level).toBe('college');
  });
});
