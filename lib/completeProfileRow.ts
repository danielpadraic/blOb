import type { ProfileUpdate } from '@/lib/types';
import { normalizeUsername } from '@/lib/username';
import { isDatabasePrivilegeError, isUnknownColumnError } from '@/utils/errors';

export const OPTIONAL_ONBOARDING_KEYS = [
  'gender',
  'height_cm',
  'current_weight',
  'goal_weight',
  'body_fat_pct',
  'body_metrics_completed_at',
  'fitness_profile',
  'motivation_tone',
  'encouragement_tone',
  'skill_tags',
  'show_fitness_stats_publicly',
] as const;

export function omitNullishProfileFields<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const key of Object.keys(out)) {
    if (key === 'id' || key === 'username') {
      continue;
    }
    if (out[key] === null || out[key] === undefined) {
      delete out[key];
    }
  }
  return out as T;
}

export function omitOptionalOnboardingFields<T extends Record<string, unknown>>(row: T): T {
  const out: Record<string, unknown> = { ...row };
  for (const key of OPTIONAL_ONBOARDING_KEYS) {
    delete out[key];
  }
  return out as T;
}

export function isOptionalProfileWriteError(error: unknown): boolean {
  return isUnknownColumnError(error) || isDatabasePrivilegeError(error);
}

/** Name + handle only. Account creation must succeed even if optional columns fail. */
export function coreProfileUpsertRow(
  userId: string,
  row: Record<string, unknown>,
): Record<string, unknown> {
  return omitNullishProfileFields({
    id: userId,
    username: row.username,
    display_name: row.display_name ?? null,
    bio: row.bio ?? null,
    weight_unit: row.weight_unit ?? 'lb',
    typical_weekly_workout_frequency: row.typical_weekly_workout_frequency ?? null,
    primary_activities: Array.isArray(row.primary_activities) ? row.primary_activities : [],
  });
}

export function buildCompleteProfileRow(userId: string, patch: ProfileUpdate): Record<string, unknown> {
  const username = patch.username
    ? normalizeUsername(patch.username)
    : `blob_${userId.replace(/-/g, '').slice(0, 10)}`;

  const row: Record<string, unknown> = {
    id: userId,
    username,
    display_name: patch.display_name ?? null,
    avatar_url: patch.avatar_url ?? null,
    bio: patch.bio ?? null,
    weight_unit: patch.weight_unit ?? 'lb',
    typical_weekly_workout_frequency: patch.typical_weekly_workout_frequency ?? null,
    primary_activities: patch.primary_activities ?? [],
  };

  if (patch.gender === 'male' || patch.gender === 'female') {
    row.gender = patch.gender;
  }
  if (patch.height_cm != null) {
    row.height_cm = patch.height_cm;
  }
  if (patch.current_weight != null) {
    row.current_weight = patch.current_weight;
  }
  if (patch.goal_weight != null) {
    row.goal_weight = patch.goal_weight;
  }
  if (patch.body_metrics_completed_at) {
    row.body_metrics_completed_at = patch.body_metrics_completed_at;
    if (patch.body_fat_pct != null) {
      row.body_fat_pct = patch.body_fat_pct;
    }
  }
  if (patch.fitness_profile) {
    row.fitness_profile = patch.fitness_profile;
  }
  if (patch.show_fitness_stats_publicly != null) {
    row.show_fitness_stats_publicly = patch.show_fitness_stats_publicly;
  }
  if (patch.motivation_tone) {
    row.motivation_tone = patch.motivation_tone;
  }
  if (patch.skill_tags && patch.skill_tags.length > 0) {
    row.skill_tags = patch.skill_tags;
  }

  return omitNullishProfileFields(row);
}

export function withTimeout<T>(promise: PromiseLike<T>, ms: number, label = 'timeout'): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(label)), ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}
