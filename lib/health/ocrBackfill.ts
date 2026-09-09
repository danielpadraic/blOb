/**
 * Shared rules for the screenshot OCR backfill.
 *
 * The live composer still reads a still at attach time. This module only decides which already
 * posted check-ins are safe to read, and never invents numbers.
 */

import { isFitnessShapedChallenge } from '@/lib/health/fitnessShaped';
import { isOcrEligibleProof } from '@/lib/health/ocrSession';
import type { CheckinHealthProof } from '@/lib/health/checkinHealthProof';

const VENDOR = new Set(['healthkit', 'health_connect']);
const VIDEO_RE = /\.(mov|mp4|m4v|webm|avi)(\?|$)/i;

export function isVendorHealthSource(source?: string | null): boolean {
  return VENDOR.has(String(source ?? '').trim());
}

/** Legacy HealthKit rows often stored clocks without a source field. Treat those as vendor. */
export function isVendorHealthSlot(input: {
  health?: { source?: string | null; startedAt?: string | null; endedAt?: string | null } | null;
  healthWorkoutId?: string | null;
}): boolean {
  if (String(input.healthWorkoutId ?? '').trim()) {
    return true;
  }
  const source = String(input.health?.source ?? '').trim();
  if (isVendorHealthSource(source)) {
    return true;
  }
  if (!source && input.health?.startedAt && input.health?.endedAt) {
    return true;
  }
  return false;
}

export function hasUsableHealthMetrics(health?: {
  durationSec?: number | null;
  activeEnergyKcal?: number | null;
  totalEnergyKcal?: number | null;
  avgHrBpm?: number | null;
  maxHrBpm?: number | null;
  distanceMeters?: number | null;
} | null): boolean {
  if (!health) {
    return false;
  }
  return (
    positive(health.durationSec) ||
    positive(health.activeEnergyKcal) ||
    positive(health.totalEnergyKcal) ||
    positive(health.avgHrBpm) ||
    positive(health.maxHrBpm) ||
    positive(health.distanceMeters)
  );
}

export function hasUsablePostStats(stats?: {
  duration_sec?: number | null;
  distance_m?: number | null;
  active_cal?: number | null;
  total_cal?: number | null;
  hr_avg?: number | null;
} | null): boolean {
  if (!stats) {
    return false;
  }
  return (
    positive(stats.duration_sec) ||
    positive(stats.distance_m) ||
    positive(stats.active_cal) ||
    positive(stats.total_cal) ||
    positive(stats.hr_avg)
  );
}

export function isVideoStillUrl(url?: string | null, mimeType?: string | null): boolean {
  if (String(mimeType ?? '').toLowerCase().startsWith('video/')) {
    return true;
  }
  return VIDEO_RE.test(String(url ?? '').split('?')[0] ?? '');
}

function urlFromUnknown(item: unknown): string {
  if (typeof item === 'string') {
    return item.trim();
  }
  if (item && typeof item === 'object' && 'url' in item) {
    return String((item as { url?: unknown }).url ?? '').trim();
  }
  return '';
}

export function pickStillUrl(part: { url?: string | null; urls?: unknown[] | null }): string {
  return pickStillUrls(part)[0] ?? '';
}

/** A posted HR / distance screenshot slot that Send should send to the reader. */
export function shouldPostSendOcrSlot(input: {
  proof?: { method?: string | null } | null;
  urls?: string[] | null;
  health?: { source?: string | null; startedAt?: string | null; endedAt?: string | null } | null;
  healthWorkoutId?: string | null;
}): boolean {
  const method = String(input.proof?.method ?? '').trim().toLowerCase();
  if (method !== 'hr' && method !== 'distance') {
    return false;
  }
  if (isVendorHealthSlot(input)) {
    return false;
  }
  return (input.urls ?? []).some((url) => {
    const value = String(url ?? '').trim();
    return value.length > 0 && !value.startsWith('health:');
  });
}

/** Every screenshot on the slot, in stored order. Videos and health: placeholders stay out. */
export function pickStillUrls(part: {
  url?: string | null;
  urls?: unknown[] | null;
  mimeType?: string | null;
  mime?: string | null;
}): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const mime = part.mimeType ?? part.mime ?? null;
  const push = (raw: string) => {
    if (!raw || raw.startsWith('health:') || isVideoStillUrl(raw, mime) || seen.has(raw)) {
      return;
    }
    seen.add(raw);
    out.push(raw);
  };
  push(String(part.url ?? '').trim());
  const extra = Array.isArray(part.urls) ? part.urls : [];
  for (const item of extra) {
    push(urlFromUnknown(item));
  }
  return out;
}

export function slotMethodOf(
  part: { method?: string | null },
  challengeProof?: { id?: string; method?: string | null } | null,
): string {
  const fromPart = String(part.method ?? '').trim().toLowerCase();
  if (fromPart) {
    return fromPart;
  }
  return String(challengeProof?.method ?? '').trim().toLowerCase();
}

/**
 * A posted still we may send to the reader. Mirrors shouldReadWorkoutStill, plus "already has
 * numbers" so a successful OCR row is not sent again.
 */
export function isOcrBackfillSlot(input: {
  method?: string | null;
  url?: string | null;
  urls?: unknown[] | null;
  mimeType?: string | null;
  health?: CheckinHealthProof | { source?: string | null } | null;
  healthWorkoutId?: string | null;
}): boolean {
  const method = String(input.method ?? '').trim().toLowerCase();
  if (method !== 'hr' && method !== 'distance') {
    return false;
  }
  if (!isOcrEligibleProof({ method })) {
    return false;
  }
  const url = pickStillUrl(input);
  if (!url || isVideoStillUrl(url, input.mimeType)) {
    return false;
  }
  if (isVendorHealthSlot(input)) {
    return false;
  }
  if (hasUsableHealthMetrics(input.health as { durationSec?: number } | null)) {
    return false;
  }
  return true;
}

function positive(value?: number | null): boolean {
  const n = Number(value);
  return Number.isFinite(n) && n > 0;
}

/** Storage object key inside this project's challenge-proofs bucket, or null. */
export function challengeProofObjectPath(raw: string, supabaseUrl: string): string | null {
  let url: URL;
  let base: URL;
  try {
    url = new URL(raw);
    base = new URL(supabaseUrl);
  } catch {
    return null;
  }
  if (url.hostname.toLowerCase() !== base.hostname.toLowerCase()) {
    return null;
  }
  const match = url.pathname.match(/\/storage\/v1\/object\/(?:sign|public)\/challenge-proofs\/(.+)$/);
  if (!match?.[1]) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

export type OcrBackfillPart = {
  method?: string | null;
  url?: string | null;
  urls?: unknown[] | null;
  mimeType?: string | null;
  mime?: string | null;
  health?: CheckinHealthProof | { source?: string | null } | null;
  healthWorkoutId?: string | null;
};

export type OcrBackfillSlot = {
  slotId: string;
  url: string;
  urls: string[];
  method: 'hr' | 'distance';
};

/** Rooms we may backfill: fitness-shaped, category fitness, or an HR / distance proof. */
export function isFitnessBackfillChallenge(
  challenge?: {
    category?: string | null;
    proofs?: Array<{ id?: string; method?: string | null }> | null;
    proof_type?: string | null;
    proof_requirements?: unknown;
    task?: string | null;
    tasks?: unknown[] | null;
    rules?: string | null;
    description?: string | null;
    title?: string | null;
  } | null,
): boolean {
  if (!challenge) {
    return false;
  }
  if (String(challenge.category ?? '').trim().toLowerCase() === 'fitness') {
    return true;
  }
  const methods = Array.isArray(challenge.proofs)
    ? challenge.proofs.map((proof) => String(proof?.method ?? '').trim().toLowerCase())
    : [];
  if (methods.some((method) => ['hr', 'distance', 'steps', 'workout', 'duration'].includes(method))) {
    return true;
  }
  if (['hr', 'distance', 'steps', 'workout', 'duration'].includes(String(challenge.proof_type ?? '').trim().toLowerCase())) {
    return true;
  }
  return isFitnessShapedChallenge({
    proof_type: challenge.proof_type,
    task: challenge.task,
    tasks: challenge.tasks,
    rules: challenge.rules,
    description: challenge.description,
    title: challenge.title,
  });
}

/**
 * First HR / distance still that is safe to read. Null when the Live post already has chips,
 * the room is not fitness-shaped, or every slot is HealthKit / selfie / video / already numbered.
 */
export function pickOcrBackfillSlot(input: {
  challenge?: Parameters<typeof isFitnessBackfillChallenge>[0];
  proofs?: Array<{ id?: string; method?: string | null }> | null;
  parts?: Record<string, OcrBackfillPart> | null;
  postStats?: Parameters<typeof hasUsablePostStats>[0];
}): OcrBackfillSlot | null {
  if (!isFitnessBackfillChallenge(input.challenge)) {
    return null;
  }
  if (hasUsablePostStats(input.postStats)) {
    return null;
  }
  const parts = input.parts ?? {};
  const proofs = Array.isArray(input.proofs) ? input.proofs : [];
  const ids = Object.keys(parts).sort();
  for (const slotId of ids) {
    const part = parts[slotId];
    if (!part) {
      continue;
    }
    const challengeProof = proofs.find((proof) => proof.id === slotId) ?? null;
    const method = slotMethodOf(part, challengeProof);
    if (method !== 'hr' && method !== 'distance') {
      continue;
    }
    if (
      !isOcrBackfillSlot({
        ...part,
        method,
        mimeType: part.mimeType ?? part.mime,
      })
    ) {
      continue;
    }
    const urls = pickStillUrls({ ...part, mimeType: part.mimeType ?? part.mime });
    return { slotId, url: urls[0] ?? pickStillUrl(part), urls, method };
  }
  return null;
}

/** Every HR / distance screenshot slot that is safe to read, each with every still. */
export function pickOcrBackfillSlots(input: {
  challenge?: Parameters<typeof isFitnessBackfillChallenge>[0];
  proofs?: Array<{ id?: string; method?: string | null }> | null;
  parts?: Record<string, OcrBackfillPart> | null;
  postStats?: Parameters<typeof hasUsablePostStats>[0];
}): OcrBackfillSlot[] {
  if (!isFitnessBackfillChallenge(input.challenge)) {
    return [];
  }
  if (hasUsablePostStats(input.postStats)) {
    return [];
  }
  const parts = input.parts ?? {};
  const proofs = Array.isArray(input.proofs) ? input.proofs : [];
  const found: OcrBackfillSlot[] = [];
  for (const slotId of Object.keys(parts).sort()) {
    const part = parts[slotId];
    if (!part) {
      continue;
    }
    const challengeProof = proofs.find((proof) => proof.id === slotId) ?? null;
    const method = slotMethodOf(part, challengeProof);
    if (method !== 'hr' && method !== 'distance') {
      continue;
    }
    if (
      !isOcrBackfillSlot({
        ...part,
        method,
        mimeType: part.mimeType ?? part.mime,
      })
    ) {
      continue;
    }
    const urls = pickStillUrls({ ...part, mimeType: part.mimeType ?? part.mime });
    if (urls.length === 0) {
      continue;
    }
    found.push({ slotId, url: urls[0], urls, method });
  }
  return found;
}
