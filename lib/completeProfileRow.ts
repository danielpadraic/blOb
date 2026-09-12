import type { ProfileUpdate } from '@/lib/types';
import { normalizeUsername } from '@/lib/username';
import {
  getProfileSetupSaveMessage,
  isDatabasePrivilegeError,
  isSignedOutSetupError,
  isUnknownColumnError,
  isUsernameTakenError,
  logProfileSetupError,
} from '@/utils/errors';

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

/** Last-ditch write: identity only. Training / units can fail without trapping setup. */
export function namesOnlyProfileUpsertRow(
  userId: string,
  row: Record<string, unknown>,
): Record<string, unknown> {
  return omitNullishProfileFields({
    id: userId,
    username: row.username,
    display_name: row.display_name ?? null,
    bio: row.bio ?? null,
  });
}

/** Finish/Skip must write a row even when get_my_profile never populated cache. */
export function mergeSelfProfilePatch(
  current: unknown,
  userId: string,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const base =
    current && typeof current === 'object' && !Array.isArray(current)
      ? { ...(current as Record<string, unknown>) }
      : { id: userId };
  return { ...base, id: userId, ...patch };
}

export function profileSetupNamesPersisted(row: {
  username?: string | null;
  display_name?: string | null;
} | null | undefined): boolean {
  const username = String(row?.username ?? '').trim();
  const displayName = String(row?.display_name ?? '').trim();
  if (!username || username.toLowerCase().startsWith('blob_')) {
    return false;
  }
  return displayName.length >= 2;
}

/**
 * Metrics / fitness_profile / tone / unknown column / RLS failed, but the
 * lobby name is on the row — leave setup. Taken username and signed-out stay.
 */
export function shouldCompleteSetupAfterWriteError(args: {
  namesPersisted: boolean;
  error: unknown;
}): boolean {
  if (!args.namesPersisted) {
    return false;
  }
  if (isUsernameTakenError(args.error) || isSignedOutSetupError(args.error)) {
    return false;
  }
  return true;
}

export async function completeProfileWithRetries(args: {
  userId: string;
  patch: ProfileUpdate;
  upsert: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
  readNames: () => Promise<{ username?: string | null; display_name?: string | null } | null>;
}): Promise<void> {
  const row = buildCompleteProfileRow(args.userId, args.patch);

  const first = await args.upsert(row);
  if (!first.error) {
    return;
  }

  const retryRow = omitOptionalOnboardingFields(row);
  const retry = await args.upsert(retryRow);
  if (!retry.error) {
    return;
  }

  const core = coreProfileUpsertRow(args.userId, retryRow);
  const last = await args.upsert(core);
  if (!last.error) {
    return;
  }

  const namesOnly = namesOnlyProfileUpsertRow(args.userId, row);
  const names = await args.upsert(namesOnly);
  if (!names.error) {
    return;
  }

  let stored: { username?: string | null; display_name?: string | null } | null = null;
  try {
    stored = await args.readNames();
  } catch {
    stored = null;
  }

  const failed = names.error ?? last.error ?? retry.error ?? first.error;
  if (
    shouldCompleteSetupAfterWriteError({
      namesPersisted: profileSetupNamesPersisted(stored),
      error: failed,
    })
  ) {
    logProfileSetupError(failed);
    return;
  }

  throwProfileSetupWriteError(failed);
}

export function throwProfileSetupWriteError(error: unknown): never {
  logProfileSetupError(error);
  throw new Error(getProfileSetupSaveMessage(error));
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
