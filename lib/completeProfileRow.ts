import type { ProfileUpdate } from '@/lib/types';
import { normalizeUsername } from '@/lib/username';
import {
  getProfileSetupSaveMessage,
  isDatabasePrivilegeError,
  isSignedOutSetupError,
  isUnknownColumnError,
  isUsernameTakenError,
  logProfileSetupWrite,
  setupWriteLogFromError,
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

export function namesPatchFromCompleteRow(row: Record<string, unknown>): {
  username: string;
  display_name: string;
  bio: string | null;
} {
  const bio = row.bio == null || row.bio === '' ? null : String(row.bio);
  return {
    username: normalizeUsername(String(row.username ?? '')),
    display_name: String(row.display_name ?? '').trim(),
    bio,
  };
}

export function optionalSetupUpdateRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (row.weight_unit === 'kg' || row.weight_unit === 'lb') {
    out.weight_unit = row.weight_unit;
  }
  if (row.typical_weekly_workout_frequency != null) {
    out.typical_weekly_workout_frequency = row.typical_weekly_workout_frequency;
  }
  if (Array.isArray(row.primary_activities)) {
    out.primary_activities = row.primary_activities;
  }
  for (const key of OPTIONAL_ONBOARDING_KEYS) {
    if (row[key] !== undefined) {
      out[key] = row[key];
    }
  }
  return out;
}

export function isMissingCompleteProfileRpc(error: unknown): boolean {
  const record = error && typeof error === 'object' ? (error as Record<string, unknown>) : null;
  const code = String(record?.code ?? '').toUpperCase();
  const raw = `${record?.message ?? ''} ${error instanceof Error ? error.message : ''}`.toLowerCase();
  return (
    code === 'PGRST202' ||
    code === '42883' ||
    raw.includes('pgrst202') ||
    raw.includes('could not find the function') ||
    raw.includes('complete_my_profile') && raw.includes('schema cache')
  );
}

export async function completeProfileWithRetries(args: {
  userId: string;
  patch: ProfileUpdate;
  writeNames: (input: {
    username: string;
    display_name: string;
    bio: string | null;
  }) => Promise<{
    error: unknown;
    data?: { username?: string | null; display_name?: string | null } | null;
  }>;
  writeOptional?: (row: Record<string, unknown>) => Promise<{ error: unknown }>;
  readNames: () => Promise<{ username?: string | null; display_name?: string | null } | null>;
  hasSession?: boolean;
}): Promise<void> {
  const row = buildCompleteProfileRow(args.userId, args.patch);
  const namesInput = namesPatchFromCompleteRow(row);
  const session = { hasSession: args.hasSession ?? true, userId: args.userId };

  const names = await args.writeNames(namesInput);
  logProfileSetupWrite({
    attempt: 'names',
    keys: ['username', 'display_name', 'bio'],
    ...setupWriteLogFromError(names.error),
    ...session,
  });

  if (names.error && (isUsernameTakenError(names.error) || isSignedOutSetupError(names.error))) {
    throwProfileSetupWriteError(names.error);
  }

  let stored = names.data ?? null;
  if (!profileSetupNamesPersisted(stored)) {
    try {
      stored = await args.readNames();
    } catch {
      stored = stored;
    }
  }

  const namesOk = profileSetupNamesPersisted(stored ?? names.data);
  if (namesOk) {
    const optional = optionalSetupUpdateRow(row);
    if (args.writeOptional && Object.keys(optional).length > 0) {
      const extra = await args.writeOptional(optional);
      logProfileSetupWrite({
        attempt: 'optional',
        keys: Object.keys(optional),
        ...setupWriteLogFromError(extra.error),
        ...session,
      });
    }
    return;
  }

  throwProfileSetupWriteError(names.error ?? new Error('We couldn’t save your name. Try again.'));
}

export function throwProfileSetupWriteError(error: unknown): never {
  logProfileSetupWrite({
    attempt: 'fail',
    keys: [],
    ...setupWriteLogFromError(error),
    hasSession: true,
    userId: null,
  });
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
