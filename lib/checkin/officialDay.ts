import { parseChallengeProofs, parseProofParts } from '@/lib/challengeProofs';
import { checkinSlotSnapshot } from '@/lib/multiCheckin';
import { normalizePeriodKey } from '@/lib/checkinPeriod';

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

function storedWorkoutSeconds(row: {
  proof_parts?: unknown;
}): number {
  const parts = parseProofParts(row.proof_parts);
  for (const key of ['hr', 'hr_monitor']) {
    const health = parts[key]?.health as { durationSec?: number } | null | undefined;
    const seconds = Number(health?.durationSec);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds;
    }
  }
  return 0;
}

/**
 * Class A (every slot filled) or class B (a stored workout of at least 30 minutes).
 * A pre selfie with no workout does not count. Status ready still counts.
 */
export function officialPeriodCounts(row: {
  proof_parts?: unknown;
  pre_selfie_url?: string | null;
  post_selfie_url?: string | null;
  hr_monitor_url?: string | null;
  health_workout_id?: string | null;
} | null | undefined): boolean {
  if (officialPeriodFullyProved(row)) {
    return true;
  }
  if (!row) {
    return false;
  }
  return storedWorkoutSeconds(row) >= 30 * 60;
}

type OfficialProofChallenge = {
  proofs?: unknown;
  proof_type?: string | null;
  proof_requirements?: Array<{ type?: string; required?: boolean }> | null;
  taskLabel?: string | null;
  task?: string | null;
};

export type OfficialBoardCheckin = {
  id?: string | null;
  user_id?: string | null;
  period_key?: string | null;
  proof_parts?: unknown;
  pre_selfie_url?: string | null;
  post_selfie_url?: string | null;
  hr_monitor_url?: string | null;
  health_workout_id?: string | null;
};

/**
 * The Workout slot can live on the check-in column when the part bag has not
 * copied it yet. Fold that id in so the same remaining-label check sees it.
 */
function partsWithWorkoutColumn(row: OfficialBoardCheckin): unknown {
  const workoutId = String(row.health_workout_id ?? '').trim();
  if (!workoutId) {
    return row.proof_parts;
  }
  const parts = parseProofParts(row.proof_parts);
  const hr = parts.hr ?? parts.hr_monitor;
  if (String(hr?.url ?? '').trim() || hr?.health || String(hr?.healthWorkoutId ?? '').trim()) {
    return row.proof_parts;
  }
  const base =
    row.proof_parts && typeof row.proof_parts === 'object' && !Array.isArray(row.proof_parts)
      ? { ...(row.proof_parts as Record<string, unknown>) }
      : {};
  return {
    ...base,
    hr: { method: 'hr', healthWorkoutId: workoutId },
  };
}

/**
 * Official board day. True only when this room's proof list is present and
 * remainingProofLabels is empty for the row. A selfie pair with Workout still
 * open does not count. An empty proof list does not count every row.
 */
export function officialBoardDayComplete(
  challenge: OfficialProofChallenge | null | undefined,
  row: OfficialBoardCheckin | null | undefined,
): boolean {
  if (!challenge || !row) {
    return false;
  }
  if (parseChallengeProofs(challenge.proofs).length === 0) {
    return false;
  }
  const snap = checkinSlotSnapshot(challenge, partsWithWorkoutColumn(row), {
    pre_selfie_url: row.pre_selfie_url,
    post_selfie_url: row.post_selfie_url,
    hr_monitor_url: row.hr_monitor_url,
  });
  return snap.required > 0 && snap.remaining.length === 0;
}

export type OfficialBoardDayHit = {
  userId: string;
  periodKey: string;
  checkinId: string;
};

/** One Chicago day per person. Later duplicate rows for the same day are ignored. */
export function officialBoardDaysByUser(
  challenge: OfficialProofChallenge | null | undefined,
  rows: readonly OfficialBoardCheckin[],
): Map<string, OfficialBoardDayHit[]> {
  const seen = new Set<string>();
  const byUser = new Map<string, OfficialBoardDayHit[]>();
  for (const row of rows) {
    if (!officialBoardDayComplete(challenge, row)) {
      continue;
    }
    const userId = String(row.user_id ?? '').trim();
    const periodKey = normalizePeriodKey(row.period_key);
    const checkinId = String(row.id ?? '').trim();
    if (!userId || !periodKey || !checkinId) {
      continue;
    }
    const stamp = `${userId}|${periodKey}`;
    if (seen.has(stamp)) {
      continue;
    }
    seen.add(stamp);
    const list = byUser.get(userId) ?? [];
    list.push({ userId, periodKey, checkinId });
    byUser.set(userId, list);
  }
  for (const [userId, list] of byUser) {
    list.sort((a, b) => a.periodKey.localeCompare(b.periodKey));
    byUser.set(userId, list);
  }
  return byUser;
}
