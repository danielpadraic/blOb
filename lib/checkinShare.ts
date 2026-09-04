import type { ChallengeProof, ChallengeProofPart } from '@/lib/challengeProofs';
import { mediaUrlKey, proofDisplayName, uniqueProofUrls } from '@/lib/challengeProofs';
import { isPrivateChallenge } from '@/lib/challengeDiscoverability';
import { copy } from '@/lib/copy';
import { isPrivateCorporate } from '@/lib/privacyMode';
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

export function defaultCheckinSharePrefs(): CheckinSharePrefs {
  return { home: true, wave: false };
}

export function prefsFromProfile(profile?: {
  checkin_share_home?: boolean | null;
  checkin_share_wave?: boolean | null;
} | null): CheckinSharePrefs {
  return {
    home: profile?.checkin_share_home !== false,
    wave: profile?.checkin_share_wave === true,
  };
}

/** Private / corporate: no Home announce and no Wave. */
export function checkinHidesHomeShare(challenge?: {
  privacy_mode?: string | null;
  visibility?: string | null;
  challenge_lane?: string | null;
} | null): boolean {
  const mode = String(challenge?.privacy_mode ?? '').toLowerCase();
  if (mode === 'private' || mode === 'private_corporate') {
    return true;
  }
  return isPrivateCorporate(challenge) || isPrivateChallenge(challenge ?? {});
}

/** Corporate / hideHome challenges never publish Home or Wave. */
export function applyCheckinShareLock(
  prefs: CheckinSharePrefs,
  hideHome: boolean,
): CheckinSharePrefs {
  if (hideHome) {
    return { home: false, wave: false };
  }
  return {
    home: prefs.home !== false,
    wave: prefs.wave === true,
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
      home: parsed.home !== false,
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

export type CheckinWaveSource = {
  url: string;
  mediaType: 'image' | 'video';
  caption: string;
  durationMs?: number | null;
};

/** First selfie or short clip on this check-in. One Wave, not every proof. */
export function pickCheckinWaveSource(input: {
  proofs: ChallengeProof[];
  parts: Record<string, ChallengeProofPart | undefined>;
  drafts?: Record<string, { durationMs?: number | null } | undefined>;
  captions?: Record<string, string>;
  extras?: Array<{ remoteUrl?: string | null; uri?: string | null; kind?: string | null }>;
}): CheckinWaveSource | null {
  for (const proof of input.proofs) {
    const part = input.parts[proof.id];
    const url = String(part?.url ?? '').trim();
    const durationMs = input.drafts?.[proof.id]?.durationMs;
    if (!canWaveProof({ method: proof.method, uri: url, durationMs })) {
      continue;
    }
    return {
      url,
      mediaType: proof.method === 'video' ? 'video' : 'image',
      caption: clampProofCaption(input.captions?.[proof.id] ?? part?.caption ?? ''),
      durationMs,
    };
  }
  for (const extra of input.extras ?? []) {
    const url = String(extra.remoteUrl ?? extra.uri ?? '').trim();
    const kind = String(extra.kind ?? '').toLowerCase();
    if (!url || kind === 'gif' || url.startsWith('health:')) {
      continue;
    }
    if (kind !== 'photo' && kind !== 'video' && kind !== 'image') {
      continue;
    }
    return {
      url,
      mediaType: kind === 'video' ? 'video' : 'image',
      caption: '',
    };
  }
  return null;
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
