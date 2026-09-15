import { asCheckinStatus, type ChallengeCheckin } from '@/lib/challengeCheckin';
import {
  parseProofParts,
  proofImageUrls,
  uniqueProofUrls,
  type ChallengeProofPart,
} from '@/lib/challengeProofs';
import { checkinComposerPrefill } from '@/lib/checkin/captions';
import { normalizePeriodKey } from '@/lib/checkinPeriod';

const FEED_EXTRA_KEY = '__feed';

function createdMs(row: { created_at?: unknown }): number {
  const at = Date.parse(String(row.created_at ?? ''));
  return Number.isFinite(at) ? at : 0;
}

function mergePart(existing: ChallengeProofPart | undefined, incoming: ChallengeProofPart): ChallengeProofPart {
  if (!existing) {
    return incoming;
  }
  const urls = uniqueProofUrls([...proofImageUrls(existing), ...proofImageUrls(incoming)]);
  return {
    ...existing,
    ...incoming,
    url: existing.url || incoming.url || urls[0] || '',
    urls,
    text: existing.text?.trim() ? existing.text : incoming.text,
    caption: existing.caption?.trim() ? existing.caption : incoming.caption,
    health: existing.health ?? incoming.health ?? null,
    healthWorkoutId: existing.healthWorkoutId || incoming.healthWorkoutId || null,
  };
}

function firstUrl(...values: Array<string | null | undefined>): string | null {
  for (const value of values) {
    const url = String(value ?? '').trim();
    if (url) {
      return url;
    }
  }
  return null;
}

/** Oldest period row wins. Later rows UPDATE the same check-in — never a second card. */
export function mergePeriodCheckinRows(rows: Record<string, unknown>[]): Record<string, unknown> | null {
  if (rows.length === 0) {
    return null;
  }
  const sorted = [...rows].sort((a, b) => createdMs(a) - createdMs(b));
  const oldest = { ...sorted[0] };
  const parts = parseProofParts(oldest.proof_parts);
  for (const row of sorted.slice(1)) {
    for (const [id, part] of Object.entries(parseProofParts(row.proof_parts))) {
      parts[id] = mergePart(parts[id], part);
    }
    oldest.pre_selfie_url = firstUrl(
      typeof oldest.pre_selfie_url === 'string' ? oldest.pre_selfie_url : null,
      typeof row.pre_selfie_url === 'string' ? row.pre_selfie_url : null,
    );
    oldest.post_selfie_url = firstUrl(
      typeof oldest.post_selfie_url === 'string' ? oldest.post_selfie_url : null,
      typeof row.post_selfie_url === 'string' ? row.post_selfie_url : null,
    );
    oldest.hr_monitor_url = firstUrl(
      typeof oldest.hr_monitor_url === 'string' ? oldest.hr_monitor_url : null,
      typeof row.hr_monitor_url === 'string' ? row.hr_monitor_url : null,
    );
    oldest.health_workout_id = firstUrl(
      typeof oldest.health_workout_id === 'string' ? oldest.health_workout_id : null,
      typeof row.health_workout_id === 'string' ? row.health_workout_id : null,
    );
    const incomingNotes = checkinComposerPrefill(typeof row.notes === 'string' ? row.notes : null);
    if (!checkinComposerPrefill(typeof oldest.notes === 'string' ? oldest.notes : null) && incomingNotes) {
      oldest.notes = incomingNotes;
    }
    if (!oldest.submitted_at && row.submitted_at) {
      oldest.submitted_at = row.submitted_at;
    }
    const incomingStatus = asCheckinStatus(row.status);
    const oldestStatus = asCheckinStatus(oldest.status);
    if (incomingStatus === 'submitted' || (incomingStatus === 'ready' && oldestStatus !== 'submitted')) {
      oldest.status = incomingStatus;
    }
    if (row.updated_at && String(row.updated_at) > String(oldest.updated_at ?? '')) {
      oldest.updated_at = row.updated_at;
    }
  }
  oldest.proof_parts = parts;
  oldest.period_key = normalizePeriodKey(oldest.period_key);
  return oldest;
}

/** Extra stills from twin Live/Home posts that share this checkin_id. */
export function mergeFeedMediaIntoParts(
  parts: Record<string, ChallengeProofPart>,
  mediaUrls: string[],
): Record<string, ChallengeProofPart> {
  const known = new Set<string>();
  for (const part of Object.values(parts)) {
    for (const url of proofImageUrls(part)) {
      known.add(url);
    }
  }
  const extras = uniqueProofUrls(mediaUrls).filter((url) => url && !known.has(url) && !url.startsWith('health:'));
  if (extras.length === 0) {
    return parts;
  }
  const existing = parts[FEED_EXTRA_KEY];
  return {
    ...parts,
    [FEED_EXTRA_KEY]: mergePart(existing, { method: 'photo', url: extras[0], urls: extras }),
  };
}

export function periodCheckinIds(rows: Array<{ id?: unknown }>): string[] {
  return rows.map((row) => String(row.id ?? '').trim()).filter(Boolean);
}

export function attachCheckinIdOf(row: Pick<ChallengeCheckin, 'id'> | null | undefined): string | null {
  const id = String(row?.id ?? '').trim();
  return id || null;
}
