import type { ChallengeProof, ChallengeProofPart } from '@/lib/challengeProofs';
import { mediaUrlKey, proofDisplayName, uniqueProofUrls } from '@/lib/challengeProofs';
import { copy } from '@/lib/copy';
import { authStorage } from '@/lib/utils/secureStore';
import { mediaDurationMs, WAVE_CLIP_MS } from '@/lib/waveClips';

export const CHECKIN_PROOF_CAPTION_MAX = 180;
export const CHECKIN_PROOF_CAPTION_COUNTER_AT = 160;

export type CheckinSharePrefs = {
  home: boolean;
  wave: boolean;
};

function prefsKey(userId: string): string {
  return `checkin-share:${userId}`;
}

export function clampProofCaption(value: string): string {
  return value.replace(/\r\n/g, '\n').slice(0, CHECKIN_PROOF_CAPTION_MAX);
}

export function proofCaptionCounter(value: string): string | null {
  const n = value.length;
  if (n < CHECKIN_PROOF_CAPTION_COUNTER_AT) {
    return null;
  }
  return `${n}/${CHECKIN_PROOF_CAPTION_MAX}`;
}

export function prefsFromProfile(profile?: {
  checkin_share_home?: boolean | null;
  checkin_share_wave?: boolean | null;
} | null): CheckinSharePrefs {
  return {
    home: profile?.checkin_share_home === true,
    wave: profile?.checkin_share_wave === true,
  };
}

/** Corporate: no Home. Check-in never shares to Wave. */
export function applyCheckinShareLock(
  prefs: CheckinSharePrefs,
  corporate: boolean,
): CheckinSharePrefs {
  return {
    home: corporate ? false : prefs.home === true,
    wave: false,
  };
}

export function isHeartRateProofSlot(proof: {
  id?: string;
  method?: string | null;
  name?: string | null;
}): boolean {
  if (proof.method === 'hr') {
    return true;
  }
  const lower = String(proof.name ?? '').toLowerCase();
  return (
    proof.id === 'hr' ||
    lower.includes('elevated heart') ||
    lower.includes('heart rate') ||
    lower.includes('heart-rate')
  );
}

export function proofCaptionPlaceholder(proof: ChallengeProof): string {
  if (isHeartRateProofSlot(proof)) {
    return copy('checkin.describeWorkout');
  }
  return proofDisplayName(proof);
}

export function proofCaptionHelper(proof: ChallengeProof): string | null {
  if (!isHeartRateProofSlot(proof)) {
    return null;
  }
  const instruction = proofDisplayName(proof).trim();
  return instruction && instruction !== copy('checkin.describeWorkout') ? instruction : null;
}

export async function readLocalSharePrefs(userId: string): Promise<CheckinSharePrefs | null> {
  try {
    const raw = await authStorage.getItem(prefsKey(userId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as { home?: unknown; wave?: unknown };
    return {
      home: parsed.home === true,
      wave: parsed.wave === true,
    };
  } catch {
    return null;
  }
}

export async function writeLocalSharePrefs(userId: string, prefs: CheckinSharePrefs): Promise<void> {
  try {
    await authStorage.setItem(prefsKey(userId), JSON.stringify(prefs));
  } catch {
    // Device storage is optional; profile write is the source of truth.
  }
}

export function canWaveProof(input: {
  method?: string | null;
  uri?: string | null;
  durationMs?: number | null;
}): boolean {
  const uri = input.uri?.trim() ?? '';
  if (!uri || uri.startsWith('health:')) {
    return false;
  }
  const method = String(input.method ?? '').toLowerCase();
  if (method === 'video') {
    const ms = mediaDurationMs(input.durationMs);
    if (ms == null) {
      return true;
    }
    return ms <= WAVE_CLIP_MS;
  }
  return method === 'photo' || method === 'hr' || method === 'distance';
}

export function mediaCaptionsForUrls(
  urls: string[],
  proofs: ChallengeProof[],
  parts: Record<string, ChallengeProofPart>,
  captions: Record<string, string>,
): Array<string | null> {
  const byUrl = new Map<string, string>();
  for (const proof of proofs) {
    const part = parts[proof.id];
    const text = clampProofCaption(captions[proof.id] ?? part?.caption ?? '');
    if (!text) {
      continue;
    }
    for (const url of uniqueProofUrls([part?.url, ...(part?.urls ?? [])])) {
      byUrl.set(mediaUrlKey(url), text);
    }
  }
  return urls.map((url) => byUrl.get(mediaUrlKey(url)) ?? null);
}
