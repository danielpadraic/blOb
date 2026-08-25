import { describe, expect, it } from 'vitest';

import { usesAdvancedCreateEdit, usesTotalCountCheckins } from '@/lib/challengeExperience';

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
