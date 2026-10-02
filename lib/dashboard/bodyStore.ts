import { positiveNumber, type BodyDay, type BodyProvider } from '@/lib/health/bodyDays';
import type { HealthBodyDayRecord } from '@/lib/types';
import { supabase } from '@/lib/supabase';
import { isMissingRelationError } from '@/utils/errors';

function asDay(row: HealthBodyDayRecord): BodyDay {
  return {
    day: String(row.day).slice(0, 10),
    provider: row.provider === 'health_connect' ? 'health_connect' : row.provider === 'apple_health' ? 'apple_health' : null,
    steps: positiveNumber(row.steps),
    calories: positiveNumber(row.calories),
    standHours: positiveNumber(row.stand_hours),
    moveKcal: positiveNumber(row.move_kcal),
    exerciseMin: positiveNumber(row.exercise_min),
    sleepMin: positiveNumber(row.sleep_min),
    heartRate: positiveNumber(row.heart_rate),
  };
}

export async function loadStoredBodyDays(
  userId: string,
  start: string,
  end: string,
): Promise<{ days: BodyDay[]; syncedAt: string | null }> {
  const { data, error } = await supabase
    .from('health_body_days')
    .select('user_id, day, provider, steps, calories, stand_hours, move_kcal, exercise_min, sleep_min, heart_rate, synced_at')
    .eq('user_id', userId)
    .gte('day', start)
    .lte('day', end);
  if (error) {
    if (isMissingRelationError(error)) {
      return { days: [], syncedAt: null };
    }
    return { days: [], syncedAt: null };
  }
  const rows = (data ?? []) as HealthBodyDayRecord[];
  const syncedAt = rows.reduce<string | null>((latest, row) => {
    const at = String(row.synced_at ?? '');
    return at && (!latest || at > latest) ? at : latest;
  }, null);
  return { days: rows.map(asDay), syncedAt };
}

/** Keep a number already stored when this read did not return that series. Never write a zero. */
export async function saveBodyDays(userId: string, provider: BodyProvider, fresh: readonly BodyDay[]): Promise<string | null> {
  const useful = fresh.filter((day) =>
    [day.steps, day.calories, day.standHours, day.moveKcal, day.exerciseMin, day.sleepMin, day.heartRate].some(
      (value) => positiveNumber(value),
    ),
  );
  if (useful.length === 0) {
    return null;
  }
  const start = useful.reduce((min, day) => (day.day < min ? day.day : min), useful[0]?.day ?? '');
  const end = useful.reduce((max, day) => (day.day > max ? day.day : max), useful[0]?.day ?? '');
  const existing = await loadStoredBodyDays(userId, start, end);
  const byDay = new Map(existing.days.map((day) => [day.day, day]));
  const syncedAt = new Date().toISOString();
  const rows = useful.map((day) => {
    const prev = byDay.get(day.day);
    return {
      user_id: userId,
      day: day.day,
      provider,
      steps: positiveNumber(day.steps) ?? prev?.steps ?? null,
      calories: positiveNumber(day.calories) ?? prev?.calories ?? null,
      stand_hours: positiveNumber(day.standHours) ?? prev?.standHours ?? null,
      move_kcal: positiveNumber(day.moveKcal) ?? prev?.moveKcal ?? null,
      exercise_min: positiveNumber(day.exerciseMin) ?? prev?.exerciseMin ?? null,
      sleep_min: positiveNumber(day.sleepMin) ?? prev?.sleepMin ?? null,
      heart_rate: positiveNumber(day.heartRate) ?? prev?.heartRate ?? null,
      synced_at: syncedAt,
    };
  });
  const { error } = await supabase.from('health_body_days').upsert(rows, { onConflict: 'user_id,day' });
  if (error) {
    return null;
  }
  return syncedAt;
}
