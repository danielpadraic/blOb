import { describe, expect, it, vi } from 'vitest';

import {
  buildCompleteProfileRow,
  completeProfileWithRetries,
  coreProfileUpsertRow,
  mergeSelfProfilePatch,
  namesOnlyProfileUpsertRow,
  omitOptionalOnboardingFields,
  omitNullishProfileFields,
  profileSetupNamesPersisted,
  shouldCompleteSetupAfterWriteError,
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

  it('writes name fields into an empty profile cache so Home can open', () => {
    expect(
      mergeSelfProfilePatch(null, 'user-1', { username: 'danielh', display_name: 'Daniel' }),
    ).toMatchObject({
      id: 'user-1',
      username: 'danielh',
      display_name: 'Daniel',
    });
    expect(
      mergeSelfProfilePatch(
        { id: 'user-1', tos_accepted_at: '2026-09-12T00:00:00.000Z' },
        'user-1',
        { username: 'danielh', display_name: 'Daniel' },
      ),
    ).toMatchObject({
      tos_accepted_at: '2026-09-12T00:00:00.000Z',
      username: 'danielh',
      display_name: 'Daniel',
    });
  });

  it('treats a real username + display name as persisted, not blob_ placeholders', () => {
    expect(profileSetupNamesPersisted({ username: 'danielh', display_name: 'Daniel' })).toBe(true);
    expect(profileSetupNamesPersisted({ username: 'blob_abc123', display_name: 'Daniel' })).toBe(false);
    expect(profileSetupNamesPersisted({ username: 'danielh', display_name: '' })).toBe(false);
  });

  it('leaves setup when metrics fail after names persist, but not when the username is taken', () => {
    const metricsDenied = { code: '42501', message: 'permission denied for column body_fat_pct' };
    expect(
      shouldCompleteSetupAfterWriteError({ namesPersisted: true, error: metricsDenied }),
    ).toBe(true);
    expect(
      shouldCompleteSetupAfterWriteError({
        namesPersisted: true,
        error: { code: '23505', message: 'duplicate key value violates unique constraint profiles_username_key' },
      }),
    ).toBe(false);
    expect(
      shouldCompleteSetupAfterWriteError({ namesPersisted: false, error: metricsDenied }),
    ).toBe(false);
  });

  it('writes names only after optional body columns fail, then completes', async () => {
    const calls: string[] = [];
    await completeProfileWithRetries({
      userId: 'user-1',
      patch: {
        username: 'danielh',
        display_name: 'Daniel',
        gender: 'male',
        height_cm: 180,
        current_weight: 80,
        body_fat_pct: 11,
        body_metrics_completed_at: '2026-09-11T00:00:00.000Z',
        fitness_profile: { preferred_units: 'imperial' },
        motivation_tone: 'gentle',
      },
      upsert: async (row) => {
        if ('body_fat_pct' in row || 'fitness_profile' in row || 'motivation_tone' in row) {
          calls.push('full');
          return { error: { code: 'PGRST204', message: 'Could not find the body_fat_pct column' } };
        }
        if ('typical_weekly_workout_frequency' in row || 'primary_activities' in row) {
          calls.push('core');
          return { error: { code: '42501', message: 'permission denied for column typical_weekly_workout_frequency' } };
        }
        calls.push('names');
        expect(row).toMatchObject({
          id: 'user-1',
          username: 'danielh',
          display_name: 'Daniel',
        });
        expect(row).not.toHaveProperty('body_fat_pct');
        expect(row).not.toHaveProperty('fitness_profile');
        return { error: null };
      },
      readNames: async () => ({ username: 'danielh', display_name: 'Daniel' }),
    });
    expect(calls[0]).toBe('full');
    expect(calls.at(-1)).toBe('names');
    expect(namesOnlyProfileUpsertRow('user-1', { username: 'danielh', display_name: 'Daniel' })).toEqual({
      id: 'user-1',
      username: 'danielh',
      display_name: 'Daniel',
    });
  });

  it('completes from a verify-read when every upsert fails but names are already on the row', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await completeProfileWithRetries({
      userId: 'user-1',
      patch: {
        username: 'danielh',
        display_name: 'Daniel',
        gender: 'female',
        body_metrics_completed_at: '2026-09-11T00:00:00.000Z',
        body_fat_pct: 22,
      },
      upsert: async () => ({
        error: { code: '42501', message: 'permission denied for column fitness_profile' },
      }),
      readNames: async () => ({ username: 'danielh', display_name: 'Daniel' }),
    });
    expect(warn).toHaveBeenCalledWith('[blob:setup]', '42501', 'permission denied for column fitness_profile');
    warn.mockRestore();
  });

  it('stays on the form with a taken-username reason when names did not persist', async () => {
    await expect(
      completeProfileWithRetries({
        userId: 'user-1',
        patch: { username: 'takenname', display_name: 'Daniel' },
        upsert: async () => ({
          error: { code: '23505', message: 'duplicate key value violates unique constraint profiles_username_key' },
        }),
        readNames: async () => ({ username: 'blob_abc', display_name: null }),
      }),
    ).rejects.toThrow('That username is taken. Try another one.');
  });
});
