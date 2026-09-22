import { uniqueProofUrls } from '@/lib/challengeProofs';
import { isRecapCardUrl } from '@/lib/health/postWorkoutCard';

/**
 * Order after Send: user stills (selfie first), then the generated recap, then other extras.
 * Never replaces a selfie with the last HealthKit / Lift write.
 */
export function unionCheckinAttachmentUrls(input: {
  stills?: Array<string | null | undefined> | null;
  recap?: string | null;
  extras?: Array<string | null | undefined> | null;
}): string[] {
  const recap = String(input.recap ?? '').trim();
  const stills: string[] = [];
  const extra: string[] = [];
  for (const url of uniqueProofUrls([...(input.stills ?? []), ...(input.extras ?? [])])) {
    if (url.startsWith('health:')) {
      continue;
    }
    if (isRecapCardUrl(url, recap || null)) {
      continue;
    }
    if ((input.stills ?? []).some((item) => String(item ?? '').split('?')[0] === url.split('?')[0])) {
      stills.push(url);
    } else {
      extra.push(url);
    }
  }
  const recapUrl = recap && !recap.startsWith('health:') ? recap : '';
  return uniqueProofUrls([...stills, recapUrl, ...extra]);
}

/** Proof-part media: keep every user still, then one recap. Vendor attach is extra, not a wipe. */
export function proofPartMediaUrls(input: {
  uploaded?: Array<string | null | undefined> | null;
  recap?: string | null;
}): string[] {
  const uploaded = uniqueProofUrls(input.uploaded).filter((url) => url && !url.startsWith('health:'));
  const named = String(input.recap ?? '').trim();
  const stills: string[] = [];
  const cards: string[] = [];
  for (const url of uploaded) {
    if (isRecapCardUrl(url, named || null)) {
      cards.push(url);
    } else {
      stills.push(url);
    }
  }
  const recap = cards.find((url) => isRecapCardUrl(url, named || null)) ?? (named && !named.startsWith('health:') ? named : '');
  return uniqueProofUrls([...stills, recap]);
}

export function workoutOverlapsLiftWindow(input: {
  workoutStartedAt?: string | null;
  workoutEndedAt?: string | null;
  liftPerformedAt?: string | null;
  liftCompletedAt?: string | null;
  providerWorkoutId?: string | null;
  liftHealthkitUuid?: string | null;
}): boolean {
  const uuid = String(input.liftHealthkitUuid ?? '').trim();
  const providerId = String(input.providerWorkoutId ?? '').trim();
  if (uuid && providerId && uuid === providerId) {
    return true;
  }
  const liftStart = Date.parse(String(input.liftPerformedAt ?? ''));
  if (!Number.isFinite(liftStart)) {
    return false;
  }
  const liftEnd = Date.parse(String(input.liftCompletedAt ?? ''));
  const windowEnd = Number.isFinite(liftEnd) ? liftEnd : liftStart + 90 * 60 * 1000;
  const workoutStart = Date.parse(String(input.workoutStartedAt ?? ''));
  const workoutEnd = Date.parse(String(input.workoutEndedAt ?? ''));
  if (!Number.isFinite(workoutStart) || !Number.isFinite(workoutEnd)) {
    return false;
  }
  return workoutStart < windowEnd && workoutEnd > liftStart;
}
