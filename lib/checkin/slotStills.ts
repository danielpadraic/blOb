import { uniqueProofUrls, type ChallengeProof } from '@/lib/challengeProofs';

/** Tracker screens often split duration / HR / calories. Keep enough stills to cover that. */
export const HR_DISTANCE_STILL_CAP = 6;

export function slotStillUris(draft?: { uri?: string | null; uris?: string[] | null } | null): string[] {
  return uniqueProofUrls([draft?.uri, ...(Array.isArray(draft?.uris) ? draft.uris : [])]).filter(
    (url) => url && !url.startsWith('health:'),
  );
}

export function withSlotStills<T extends { uri?: string; uris?: string[] | null }>(
  draft: T | undefined,
  stills: string[],
): T {
  const urls = uniqueProofUrls(stills).filter((url) => url && !url.startsWith('health:'));
  return {
    ...(draft ?? ({} as T)),
    uri: urls[0],
    uris: urls,
  };
}

/** Extra tracker screens on HR / distance only. Vendor cards and selfies stay a single required still. */
export function slotAllowsMultipleStills(
  proof?: Pick<ChallengeProof, 'method'> | null,
  draft?: {
    healthWorkoutId?: string | null;
    health?: { source?: string | null } | null;
  } | null,
): boolean {
  if (!proof || (proof.method !== 'hr' && proof.method !== 'distance')) {
    return false;
  }
  if (draft?.healthWorkoutId) {
    return false;
  }
  const source = draft?.health?.source;
  if (source === 'healthkit' || source === 'health_connect') {
    return false;
  }
  return true;
}
