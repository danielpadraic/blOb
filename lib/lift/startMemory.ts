import { orderMuscles, type MuscleKey } from '@/lib/lift/muscles';

/**
 * Muscle picks on the Lift start step. Survives Continue → exercises → Back so Chest stays
 * selected. Never written to the server — the session row already has the keys.
 */
let lastPicked: MuscleKey[] = [];

export function rememberLiftMuscles(keys: readonly string[] | null | undefined): MuscleKey[] {
  lastPicked = orderMuscles(keys);
  return [...lastPicked];
}

export function recalledLiftMuscles(): MuscleKey[] {
  return [...lastPicked];
}
