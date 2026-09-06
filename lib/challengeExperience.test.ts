import { describe, expect, it } from 'vitest';

import {
  distanceProofIsSessionLog,
  usesAdvancedCreateEdit,
  usesConsistencyExperience,
  usesPointsBoard,
  usesQuantityScoring,
  usesTotalCountCheckins,
} from '@/lib/challengeExperience';

describe('usesAdvancedCreateEdit', () => {
  it('sends Comparable Points and points challenges to Advanced edit', () => {
    expect(usesAdvancedCreateEdit({ scoring_method: 'comparable_points' })).toBe(true);
    expect(
      usesAdvancedCreateEdit({
        comparable_points_config: { version: 1, parity_points: 1, activities: [{ name: 'Laundry', parity_qty: 1 }] },
      }),
    ).toBe(true);
    expect(usesAdvancedCreateEdit({ challenge_type: 'points' })).toBe(true);
    expect(usesAdvancedCreateEdit({ format: 'lms' })).toBe(true);
    expect(usesAdvancedCreateEdit({ challenge_lane: 'private' })).toBe(true);
    expect(usesAdvancedCreateEdit({ tasks: [{ id: 'a' }, { id: 'b' }] })).toBe(true);
  });

  it('keeps Simple-created consistency challenges on Simple edit', () => {
    expect(
      usesAdvancedCreateEdit({
        challenge_type: 'consistency',
        challenge_lane: 'coins',
        scoring_method: null,
        tasks: [],
      }),
    ).toBe(false);
  });
});

describe('usesPointsBoard', () => {
  it('treats format points as a points board', () => {
    expect(usesPointsBoard({ format: 'points', challenge_type: 'points' })).toBe(true);
    expect(usesPointsBoard({ challenge_type: 'consistency' })).toBe(false);
  });
});

describe('usesTotalCountCheckins', () => {
  it('treats once/custom target totals as check-in counts, not daily days', () => {
    expect(
      usesTotalCountCheckins({
        frequency: 'custom',
        target_count: 6,
        days_required: 7,
        challenge_type: 'consistency',
      }),
    ).toBe(true);
    expect(
      usesTotalCountCheckins({
        frequency: 'once',
        target_count: 6,
        length_value: 7,
      }),
    ).toBe(true);
  });

  it('leaves daily consistency on per-day rules', () => {
    expect(
      usesTotalCountCheckins({
        frequency: 'daily',
        target_count: 7,
        days_required: 7,
      }),
    ).toBe(false);
  });
});

describe('distanceProofIsSessionLog', () => {
  it('treats consistency and cumulative as session logs', () => {
    expect(distanceProofIsSessionLog({ challenge_type: 'consistency', frequency: 'daily' })).toBe(true);
    expect(distanceProofIsSessionLog({ challenge_type: 'cumulative', format: 'cumulative' })).toBe(true);
    expect(distanceProofIsSessionLog({ frequency: 'once', target_count: 6, length_value: 7 })).toBe(true);
  });

  it('keeps a single-event race on the fixed distance threshold', () => {
    expect(distanceProofIsSessionLog({ frequency: 'once', target_count: 1, challenge_type: 'custom' })).toBe(
      false,
    );
    expect(distanceProofIsSessionLog(null)).toBe(false);
  });
});

describe('usesQuantityScoring', () => {
  it('treats a consistency row with a miles target as a quantity Board', () => {
    const row = {
      challenge_type: 'consistency',
      format: 'consistency',
      scoring_method: 'consistency',
      target_count: 127,
      days_required: 127,
      metrics: [{ id: 'm1', target: 128, name: 'miles', unit: 'mi' }],
    };
    expect(usesQuantityScoring(row)).toBe(true);
    expect(usesConsistencyExperience(row)).toBe(false);
    expect(usesTotalCountCheckins(row)).toBe(false);
  });

  it('does not turn a daily mile habit into a race from the title alone', () => {
    expect(
      usesQuantityScoring({
        challenge_type: 'consistency',
        format: 'consistency',
        title: 'Run 1 mile every morning',
        days_required: 7,
        length_value: 7,
      }),
    ).toBe(false);
    expect(
      usesConsistencyExperience({
        challenge_type: 'consistency',
        format: 'consistency',
        title: 'Run 1 mile every morning',
        days_required: 7,
        length_value: 7,
      }),
    ).toBe(true);
  });
});
