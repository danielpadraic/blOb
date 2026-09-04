import { describe, expect, it } from 'vitest';

import { profileSetupSchema } from '@/utils/validators';

/** Name + tone only. Physical Details are left blank, as a skipping user leaves them. */
const NAMED_ONLY = {
  username: 'danielh',
  display_name: 'Daniel',
  bio: '',
  gender: '' as const,
  height_cm: '',
  height_ft: '',
  height_in: '',
  current_weight: '',
  goal_weight: '',
  weight_unit: 'lb' as const,
  body_fat_pct: 20,
  typical_weekly_workout_frequency: '3',
  primary_activities: ['running' as const],
  show_fitness_stats_publicly: false,
};

function issuePaths(input: Record<string, unknown>): string[] {
  const result = profileSetupSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => String(issue.path[0]));
}

describe('profileSetupSchema — Physical Details are optional', () => {
  it('accepts a profile with no gender, height, or weight', () => {
    expect(profileSetupSchema.safeParse(NAMED_ONLY).success).toBe(true);
  });

  it('accepts blank metrics on the metric unit too', () => {
    expect(
      profileSetupSchema.safeParse({ ...NAMED_ONLY, weight_unit: 'kg' }).success,
    ).toBe(true);
  });

  it('still requires a username and a display name', () => {
    expect(issuePaths({ ...NAMED_ONLY, username: 'no' })).toContain('username');
    expect(issuePaths({ ...NAMED_ONLY, username: 'BadCase!' })).toContain('username');
    expect(issuePaths({ ...NAMED_ONLY, display_name: 'D' })).toContain('display_name');
  });

  it('still requires training answers', () => {
    expect(issuePaths({ ...NAMED_ONLY, primary_activities: [] })).toContain(
      'primary_activities',
    );
    expect(
      issuePaths({ ...NAMED_ONLY, typical_weekly_workout_frequency: '' }),
    ).toContain('typical_weekly_workout_frequency');
  });

  it('keeps every range check on metrics the user did fill in', () => {
    expect(issuePaths({ ...NAMED_ONLY, height_ft: '9' })).toContain('height_ft');
    expect(issuePaths({ ...NAMED_ONLY, height_ft: '5', height_in: '13' })).toContain(
      'height_in',
    );
    expect(issuePaths({ ...NAMED_ONLY, current_weight: '4' })).toContain(
      'current_weight',
    );
    expect(issuePaths({ ...NAMED_ONLY, goal_weight: '9000' })).toContain('goal_weight');
    expect(
      issuePaths({ ...NAMED_ONLY, weight_unit: 'kg', height_cm: '400' }),
    ).toContain('height_cm');
  });

  it('accepts a fully filled Physical Details step', () => {
    const filled = {
      ...NAMED_ONLY,
      gender: 'male' as const,
      height_ft: '5',
      height_in: '10',
      current_weight: '165',
      goal_weight: '160',
    };
    expect(profileSetupSchema.safeParse(filled).success).toBe(true);
  });

  it('asks for feet when only inches are given', () => {
    expect(issuePaths({ ...NAMED_ONLY, height_in: '10' })).toContain('height_ft');
  });
});
