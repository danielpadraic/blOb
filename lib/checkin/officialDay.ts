import { parseProofParts } from '@/lib/challengeProofs';

/**
 * A consistency day on Official Weekly / Monthly.
 * Pre, post, and the 30-minute workout slot all have to be present.
 * A selfie alone is not a day.
 */
export function officialPeriodFullyProved(row: {
  proof_parts?: unknown;
  pre_selfie_url?: string | null;
  post_selfie_url?: string | null;
  hr_monitor_url?: string | null;
  health_workout_id?: string | null;
} | null | undefined): boolean {
  if (!row) {
    return false;
  }
  const parts = parseProofParts(row.proof_parts);
  const filled = (keys: string[], legacy?: string | null) => {
    if (String(legacy ?? '').trim()) {
      return true;
    }
    return keys.some((key) => {
      const part = parts[key];
      if (!part) {
        return false;
      }
      const urls = [part.url, ...(part.urls ?? [])].map((url) => String(url ?? '').trim()).filter(Boolean);
      return urls.length > 0 || Boolean(part.health) || Boolean(String(part.healthWorkoutId ?? '').trim());
    });
  };
  const workout =
    filled(['hr', 'hr_monitor'], row.hr_monitor_url) || Boolean(String(row.health_workout_id ?? '').trim());
  return filled(['pre', 'pre_selfie'], row.pre_selfie_url) && filled(['post', 'post_selfie'], row.post_selfie_url) && workout;
}
