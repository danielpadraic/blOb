import { supabase } from '@/lib/supabase';
import type { HealthConnection } from '@/lib/types';
import { getHealthSource } from '@/services/health';
import type { HealthSource, HealthWorkout } from '@/services/health/types';
import { getErrorMessage, isMissingRelationError, isUnknownColumnError } from '@/utils/errors';

function currentProvider(provider?: HealthSource): HealthSource | null {
  return provider ?? getHealthSource();
}

function missingHealthSchema(error: unknown): boolean {
  return isMissingRelationError(error) || isUnknownColumnError(error);
}

export async function probeOnline(): Promise<boolean> {
  try {
    const { error } = await supabase.from('health_connections').select('id').limit(1);
    if (!error) {
      return true;
    }
    const raw = `${error.message} ${error.code}`.toLowerCase();
    if (raw.includes('failed to fetch') || raw.includes('network') || raw.includes('offline')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function fetchHealthConnection(
  userId: string,
  provider?: HealthSource,
): Promise<HealthConnection | null> {
  const source = currentProvider(provider);
  if (!source) {
    return null;
  }
  const full = await supabase
    .from('health_connections')
    .select('id, user_id, provider, status, last_synced_at, hk_workout_anchor, last_error, created_at, updated_at')
    .eq('user_id', userId)
    .eq('provider', source)
    .maybeSingle();
  if (!full.error) {
    return (full.data as HealthConnection | null) ?? null;
  }
  if (!missingHealthSchema(full.error)) {
    throw new Error(getErrorMessage(full.error));
  }
  const legacy = await supabase
    .from('health_connections')
    .select('id, user_id, provider, status, last_synced_at, created_at, updated_at')
    .eq('user_id', userId)
    .eq('provider', source)
    .maybeSingle();
  if (legacy.error) {
    if (missingHealthSchema(legacy.error)) {
      return null;
    }
    throw new Error(getErrorMessage(legacy.error));
  }
  return (legacy.data as HealthConnection | null) ?? null;
}

export async function upsertHealthConnection(input: {
  userId: string;
  status: 'connected' | 'disconnected';
  lastSyncedAt?: string | null;
  hkWorkoutAnchor?: string | null;
  lastError?: string | null;
  provider?: HealthSource;
}): Promise<void> {
  const source = currentProvider(input.provider);
  if (!source) {
    return;
  }
  const now = new Date().toISOString();
  const row: Record<string, unknown> = {
    user_id: input.userId,
    provider: source,
    status: input.status,
    updated_at: now,
  };
  if (input.lastSyncedAt !== undefined) {
    row.last_synced_at = input.lastSyncedAt;
  }
  if (input.hkWorkoutAnchor !== undefined) {
    row.hk_workout_anchor = input.hkWorkoutAnchor;
  }
  if (input.lastError !== undefined) {
    row.last_error = input.lastError;
  }
  const { error } = await supabase.from('health_connections').upsert(row, { onConflict: 'user_id,provider' });
  if (!error) {
    return;
  }
  if (missingHealthSchema(error) && (input.hkWorkoutAnchor !== undefined || input.lastError !== undefined)) {
    const { error: retry } = await supabase.from('health_connections').upsert(
      {
        user_id: input.userId,
        provider: source,
        status: input.status,
        last_synced_at: input.lastSyncedAt ?? null,
        updated_at: now,
      },
      { onConflict: 'user_id,provider' },
    );
    if (retry && !missingHealthSchema(retry)) {
      throw new Error(getErrorMessage(retry));
    }
    return;
  }
  if (!missingHealthSchema(error)) {
    throw new Error(getErrorMessage(error));
  }
}

export async function upsertHealthWorkout(userId: string, workout: HealthWorkout): Promise<string> {
  const { data, error } = await supabase
    .from('health_workouts')
    .upsert(
      {
        user_id: userId,
        provider: workout.source,
        provider_workout_id: workout.providerWorkoutId,
        activity_type: workout.activityType,
        activity_label: workout.activityLabel,
        started_at: workout.startedAt,
        ended_at: workout.endedAt,
        duration_sec: workout.durationSec,
        calories_kcal: workout.caloriesKcal ?? null,
        distance_m: workout.distanceM ?? null,
        hr_avg: workout.hrAvg ?? null,
        hr_max: workout.hrMax ?? null,
        source_bundle: workout.sourceBundle ?? null,
        confidence: workout.confidence,
        raw_summary: {
          activityLabel: workout.activityLabel,
          activityType: workout.activityType,
          durationSec: workout.durationSec,
          confidence: workout.confidence,
          sourceBundle: workout.sourceBundle ?? null,
          hasHr: Boolean(workout.hrAvg || workout.hrMax),
        },
      },
      { onConflict: 'user_id,provider,provider_workout_id' },
    )
    .select('id')
    .single();
  if (error) {
    if (missingHealthSchema(error)) {
      throw new Error('health_schema_missing');
    }
    throw new Error(getErrorMessage(error));
  }
  const id = String((data as { id?: string } | null)?.id ?? '');
  if (!id) {
    throw new Error('health_schema_missing');
  }
  return id;
}

export async function fetchUsedProviderWorkoutIds(userId: string): Promise<Set<string>> {
  const source = currentProvider();
  if (!source) {
    return new Set();
  }
  const workouts = await supabase
    .from('health_workouts')
    .select('id, provider_workout_id')
    .eq('user_id', userId)
    .eq('provider', source);
  if (workouts.error) {
    if (missingHealthSchema(workouts.error)) {
      return new Set();
    }
    throw new Error(getErrorMessage(workouts.error));
  }
  const rows = (workouts.data ?? []) as Array<{ id: string; provider_workout_id: string }>;
  if (rows.length === 0) {
    return new Set();
  }
  const used = await supabase
    .from('workout_submissions')
    .select('health_workout_id')
    .eq('user_id', userId)
    .in(
      'health_workout_id',
      rows.map((row) => row.id),
    );
  if (used.error) {
    if (missingHealthSchema(used.error)) {
      return new Set();
    }
    throw new Error(getErrorMessage(used.error));
  }
  const usedIds = new Set(
    (used.data ?? [])
      .map((row) => String((row as { health_workout_id?: string | null }).health_workout_id ?? ''))
      .filter(Boolean),
  );
  return new Set(rows.filter((row) => usedIds.has(row.id)).map((row) => row.provider_workout_id));
}

export function workoutNotes(workout: HealthWorkout): string {
  const minutes = Math.max(1, Math.round(workout.durationSec / 60));
  return `${workout.activityLabel} · ${minutes} min`;
}

export async function fetchHealthWorkoutById(id: string): Promise<{
  activity_label: string;
  duration_sec: number;
  confidence: string;
  hr_avg: number | null;
  calories_kcal: number | null;
} | null> {
  const { data, error } = await supabase
    .from('health_workouts')
    .select('activity_label, duration_sec, confidence, hr_avg, calories_kcal')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    if (missingHealthSchema(error)) {
      return null;
    }
    throw new Error(getErrorMessage(error));
  }
  return data as {
    activity_label: string;
    duration_sec: number;
    confidence: string;
    hr_avg: number | null;
    calories_kcal: number | null;
  } | null;
}

export async function fetchDismissedProviderWorkoutIds(userId: string): Promise<Set<string>> {
  const source = currentProvider();
  if (!source) {
    return new Set();
  }
  const { data, error } = await supabase
    .from('health_workouts')
    .select('provider_workout_id')
    .eq('user_id', userId)
    .eq('provider', source)
    .not('dismissed_at', 'is', null);
  if (error) {
    if (missingHealthSchema(error)) {
      return new Set();
    }
    throw new Error(getErrorMessage(error));
  }
  return new Set(
    (data ?? []).map((row) => String((row as { provider_workout_id: string }).provider_workout_id)),
  );
}

export async function insertHealthWorkoutStart(input: {
  userId: string;
  challengeId: string;
  startedAt?: string;
  activityType?: string | null;
  goalSeconds?: number | null;
}): Promise<void> {
  const { error } = await supabase.from('health_workout_starts').insert({
    user_id: input.userId,
    challenge_id: input.challengeId,
    started_at: input.startedAt ?? new Date().toISOString(),
    activity_type: input.activityType ?? null,
    goal_seconds: input.goalSeconds ?? null,
  });
  if (error && !missingHealthSchema(error)) {
    throw new Error(getErrorMessage(error));
  }
}

export async function fetchLatestWorkoutStart(
  userId: string,
  challengeId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('health_workout_starts')
    .select('started_at')
    .eq('user_id', userId)
    .eq('challenge_id', challengeId)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (missingHealthSchema(error)) {
      return null;
    }
    throw new Error(getErrorMessage(error));
  }
  const started = (data as { started_at?: string } | null)?.started_at;
  return started ?? null;
}

export async function dismissHealthWorkout(
  userId: string,
  workout: HealthWorkout,
): Promise<void> {
  try {
    await upsertHealthWorkout(userId, workout);
  } catch {
    // Local dismiss still stands if the row cannot be written.
  }
  const { error } = await supabase
    .from('health_workouts')
    .update({ dismissed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('provider', workout.source)
    .eq('provider_workout_id', workout.providerWorkoutId);
  if (error && !missingHealthSchema(error)) {
    throw new Error(getErrorMessage(error));
  }
}
