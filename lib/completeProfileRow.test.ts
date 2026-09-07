import { describe, expect, it } from 'vitest';

import {
  buildCompleteProfileRow,
  coreProfileUpsertRow,
  omitOptionalOnboardingFields,
  omitNullishProfileFields,
} from '@/lib/completeProfileRow';

describe('complete profile row — optional Physical Details', () => {
  it('does not write gender, height, weight, or the metrics stamp unless the user picked them', () => {
    const row = buildCompleteProfileRow('user-1', {
      username: 'danielh',
      display_name: 'Daniel',
      bio: '',
      weight_unit: 'lb',
      primary_activities: ['running'],
      typical_weekly_workout_frequency: 3,
    });
    expect(row).not.toHaveProperty('gender');
    expect(row).not.toHaveProperty('height_cm');
    expect(row).not.toHaveProperty('current_weight');
    expect(row).not.toHaveProperty('body_fat_pct');
    expect(row).not.toHaveProperty('body_metrics_completed_at');
    expect(row.username).toBe('danielh');
    expect(row.display_name).toBe('Daniel');
  });

  it('stores gender only when the user picked male or female', () => {
    expect(
      buildCompleteProfileRow('user-1', {
        username: 'danielh',
        display_name: 'Daniel',
        gender: 'male',
      }),
    ).toMatchObject({ gender: 'male' });
    expect(
      buildCompleteProfileRow('user-1', {
        username: 'danielh',
        display_name: 'Daniel',
        gender: null,
      }),
    ).not.toHaveProperty('gender');
  });

  it('stamps body metrics only when a completed timestamp is present', () => {
    const row = buildCompleteProfileRow('user-1', {
      username: 'danielh',
      display_name: 'Daniel',
      gender: 'female',
      height_cm: 170,
      current_weight: 65,
      body_fat_pct: 22,
      body_metrics_completed_at: '2026-09-07T12:00:00.000Z',
    });
    expect(row.body_metrics_completed_at).toBe('2026-09-07T12:00:00.000Z');
    expect(row.body_fat_pct).toBe(22);
  });

  it('drops optional onboarding columns so a retry can still create the account', () => {
    const omitted = omitOptionalOnboardingFields({
      id: 'user-1',
      username: 'danielh',
      display_name: 'Daniel',
      gender: 'male',
      body_metrics_completed_at: '2026-09-07T12:00:00.000Z',
      fitness_profile: { preferred_units: 'imperial' },
    });
    expect(omitted).not.toHaveProperty('gender');
    expect(omitted).not.toHaveProperty('body_metrics_completed_at');
    expect(omitted).not.toHaveProperty('fitness_profile');
    expect(omitted.username).toBe('danielh');
  });

  it('keeps name and handle on the core retry row and omits nulls', () => {
    const core = coreProfileUpsertRow('user-1', {
      username: 'danielh',
      display_name: 'Daniel',
      bio: null,
      weight_unit: 'lb',
      primary_activities: ['running'],
    });
    expect(core).toEqual({
      id: 'user-1',
      username: 'danielh',
      display_name: 'Daniel',
      weight_unit: 'lb',
      primary_activities: ['running'],
    });
    expect(omitNullishProfileFields({ id: 'user-1', username: 'a', gender: null })).not.toHaveProperty(
      'gender',
    );
  });
});
