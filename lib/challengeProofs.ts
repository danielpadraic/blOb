import { copy } from '@/lib/copy';
import type { ProofType } from '@/lib/types';

export const CHALLENGE_PROOF_METHODS = ['photo', 'video', 'checkin', 'honor', 'hr'] as const;

export type ChallengeProofMethod = (typeof CHALLENGE_PROOF_METHODS)[number];

export type ChallengeProof = {
  id: string;
  name: string;
  method: ChallengeProofMethod;
};

export type ChallengeProofPart = {
  method: ChallengeProofMethod;
  url?: string | null;
  text?: string | null;
};

export const SIMPLE_PROOF_CAP = 4;

export const BEFORE_AFTER_HR_PRESET: Array<{ name: string; method: ChallengeProofMethod }> = [
  { name: 'Pre-selfie', method: 'photo' },
  { name: 'Post-selfie', method: 'photo' },
  { name: 'Heart rate', method: 'hr' },
];

export function newProofId(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function makeProof(name: string, method: ChallengeProofMethod): ChallengeProof {
  return { id: newProofId(), name, method };
}

export function defaultChallengeProofs(task = ''): ChallengeProof[] {
  const name = task.trim() || copy('create.proofFallback');
  return [makeProof(name, 'photo')];
}

export function isChallengeProofMethod(value: unknown): value is ChallengeProofMethod {
  return CHALLENGE_PROOF_METHODS.includes(value as ChallengeProofMethod);
}

export function methodLabel(method: ChallengeProofMethod): string {
  if (method === 'video') {
    return copy('create.proofVideo');
  }
  if (method === 'checkin') {
    return copy('create.proofCheckin');
  }
  if (method === 'honor') {
    return copy('create.proofHonor');
  }
  if (method === 'hr') {
    return copy('create.proofHr');
  }
  return copy('create.proofPhoto');
}

export function proofDisplayName(proof: ChallengeProof): string {
  const name = proof.name.trim();
  return name || methodLabel(proof.method);
}

export function firstProofMethod(proofs: ChallengeProof[]): ChallengeProofMethod {
  return proofs[0]?.method ?? 'photo';
}

/** Stored on challenges.proof_type for old rows. */
export function proofTypeFromMethod(method: ChallengeProofMethod): string {
  if (method === 'checkin') {
    return 'check_in';
  }
  return method;
}

export function methodFromProofType(value: unknown): ChallengeProofMethod {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'video') {
    return 'video';
  }
  if (raw === 'check_in' || raw === 'checkin' || raw === 'text_note' || raw === 'link') {
    return 'checkin';
  }
  if (raw === 'honor') {
    return 'honor';
  }
  if (raw === 'hr' || raw === 'hr_monitor') {
    return 'hr';
  }
  return 'photo';
}

export function methodFromLegacyType(type: string): ChallengeProofMethod {
  return methodFromProofType(type);
}

export function nameFromLegacyType(type: string): string {
  if (type === 'pre_selfie') {
    return 'Pre-selfie';
  }
  if (type === 'post_selfie') {
    return 'Post-selfie';
  }
  if (type === 'hr_monitor') {
    return 'Heart rate';
  }
  if (type === 'video') {
    return copy('create.proofVideo');
  }
  if (type === 'text_note' || type === 'link') {
    return copy('create.proofCheckin');
  }
  if (type === 'photo' || type === 'screenshot') {
    return copy('create.proofPhoto');
  }
  return '';
}

export function captureTypeForMethod(method: ChallengeProofMethod): ProofType {
  if (method === 'video') {
    return 'video';
  }
  if (method === 'hr') {
    return 'hr_monitor';
  }
  return 'photo';
}

export function legacyTypeForProof(proof: ChallengeProof): ProofType | null {
  if (proof.method === 'honor') {
    return null;
  }
  if (proof.method === 'video') {
    return 'video';
  }
  if (proof.method === 'checkin') {
    return 'text_note';
  }
  if (proof.method === 'hr') {
    return 'hr_monitor';
  }
  const named = proof.name.trim().toLowerCase();
  if (named.includes('pre')) {
    return 'pre_selfie';
  }
  if (named.includes('post')) {
    return 'post_selfie';
  }
  return 'photo';
}

export function proofRequirementsFrom(proofs: ChallengeProof[]): Array<{ type: ProofType; required: true }> {
  return proofs
    .map(legacyTypeForProof)
    .filter((type): type is ProofType => Boolean(type))
    .map((type) => ({ type, required: true as const }));
}

export function namedProofsFromLegacyTypes(types: string[]): ChallengeProof[] {
  const list = types.filter(Boolean).map((type) => makeProof(nameFromLegacyType(type), methodFromLegacyType(type)));
  return list.length > 0 ? list : [makeProof(copy('create.proofHonor'), 'honor')];
}

export function parseChallengeProofs(value: unknown): ChallengeProof[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const parsed: ChallengeProof[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as Record<string, unknown>;
    const method = isChallengeProofMethod(row.method) ? row.method : methodFromProofType(row.method ?? row.type);
    const id = typeof row.id === 'string' && row.id.trim() ? row.id.trim() : newProofId();
    const name = typeof row.name === 'string' ? row.name : '';
    parsed.push({ id, name, method });
  }
  return parsed;
}

export function proofsFromProofType(proofType: unknown): ChallengeProof[] {
  return [makeProof('', methodFromProofType(proofType))];
}

export function resolveChallengeProofs(input: {
  proofs?: unknown;
  proof_type?: unknown;
  proof_requirements?: Array<{ type?: string; required?: boolean }> | null;
}): ChallengeProof[] {
  const listed = parseChallengeProofs(input.proofs);
  if (listed.length > 0) {
    return listed;
  }
  const requirements = (input.proof_requirements ?? [])
    .filter((item) => item && item.required !== false && item.type)
    .map((item) => String(item.type));
  if (requirements.length > 0) {
    return namedProofsFromLegacyTypes(requirements);
  }
  if (input.proof_type) {
    return proofsFromProofType(input.proof_type);
  }
  return defaultChallengeProofs();
}

export function partSatisfies(proof: ChallengeProof, part: ChallengeProofPart | null | undefined): boolean {
  if (proof.method === 'honor') {
    return true;
  }
  if (proof.method === 'checkin') {
    return Boolean(part?.text?.trim() || part?.url?.trim());
  }
  return Boolean(part?.url?.trim());
}

export function logHasEveryProof(
  proofs: ChallengeProof[],
  parts: Record<string, ChallengeProofPart> | null | undefined,
): boolean {
  if (proofs.length === 0) {
    return true;
  }
  if (!parts || Object.keys(parts).length === 0) {
    return true;
  }
  return proofs.every((proof) => partSatisfies(proof, parts[proof.id]));
}

export function parseProofParts(value: unknown): Record<string, ChallengeProofPart> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }
  const parts: Record<string, ChallengeProofPart> = {};
  for (const [id, item] of Object.entries(value as Record<string, unknown>)) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as Record<string, unknown>;
    const method = isChallengeProofMethod(row.method) ? row.method : methodFromProofType(row.method);
    parts[id] = {
      method,
      url: typeof row.url === 'string' ? row.url : null,
      text: typeof row.text === 'string' ? row.text : null,
    };
  }
  return parts;
}
