import { requiredChallengeProofs } from '@/lib/challenges';
import { parseProofParts, partSatisfies, proofDisplayName, proofSlotPart } from '@/lib/challengeProofs';
import { parseCheckinHealthProof } from '@/lib/health/checkinHealthProof';

export type CheckinPeek = {
  title: string;
  proofs: string[];
};

/** Names of proof slots that were actually stored. An open slot is left off. */
export function submittedProofNames(
  challenge: Parameters<typeof requiredChallengeProofs>[0],
  parts: unknown,
  legacy?: { pre_selfie_url?: string | null; post_selfie_url?: string | null; hr_monitor_url?: string | null } | null,
): string[] {
  const parsed = parseProofParts(parts);
  const names: string[] = [];
  for (const proof of requiredChallengeProofs(challenge)) {
    if (proof.method === 'honor') {
      continue;
    }
    if (!partSatisfies(proof, proofSlotPart(proof, parsed, legacy))) {
      continue;
    }
    const name = proofDisplayName(proof).trim();
    if (name && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

export function checkinWorkoutTitle(challengeTitle: string, parts: unknown): string {
  if (parts && typeof parts === 'object') {
    for (const value of Object.values(parts as Record<string, unknown>)) {
      const health = parseCheckinHealthProof(
        value && typeof value === 'object' ? (value as { health?: unknown }).health : null,
      );
      const activity = String(health?.activityType ?? '').trim();
      if (activity) {
        return activity;
      }
    }
  }
  return challengeTitle.trim();
}
