import { officialExercise, type ExerciseOption } from '@/lib/lift/catalog';

const MAX = 8;
const recentIds: string[] = [];

/** Last official movements added on this device. Recents sit above the catalog. */
export function rememberRecentExercise(id?: string | null): void {
  const key = String(id ?? '').trim();
  if (!key || !officialExercise(key)) {
    return;
  }
  const next = [key, ...recentIds.filter((item) => item !== key)];
  recentIds.splice(0, recentIds.length, ...next.slice(0, MAX));
}

export function recentExerciseOptions(limit = MAX): ExerciseOption[] {
  const out: ExerciseOption[] = [];
  for (const id of recentIds) {
    const option = officialExercise(id);
    if (option) {
      out.push(option);
    }
    if (out.length >= limit) {
      break;
    }
  }
  return out;
}

export function resetRecentExercisesForTests(): void {
  recentIds.splice(0, recentIds.length);
}
