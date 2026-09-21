import {
  resolveChallengeProofs,
  type ChallengeProof,
} from '@/lib/challengeProofs';

export type DetailsDraft = {
  title: string;
  description: string;
  cover_image_url: string;
  rules: string;
  sponsor_name: string;
  proofs: ChallengeProof[];
};

function cloneProofs(proofs: ChallengeProof[]): ChallengeProof[] {
  return proofs.map((proof) => ({ ...proof }));
}

export function draftFromSource(source: {
  title?: string | null;
  description?: string | null;
  cover_image_url?: string | null;
  rules?: string | null;
  sponsor_name?: string | null;
  proofs?: unknown;
  proof_type?: unknown;
  proof_requirements?: Array<{ type?: string; required?: boolean }> | null;
  min_minutes?: number | string | null;
} | null | undefined): DetailsDraft {
  return {
    title: source?.title?.trim() ?? '',
    description: source?.description?.trim() ?? '',
    cover_image_url: source?.cover_image_url?.trim() ?? '',
    rules: source?.rules?.trim() ?? '',
    sponsor_name: source?.sponsor_name?.trim() ?? '',
    proofs: cloneProofs(
      resolveChallengeProofs({
        proofs: source?.proofs,
        proof_type: source?.proof_type,
        proof_requirements: source?.proof_requirements,
        min_minutes: source?.min_minutes,
      }),
    ),
  };
}

/** First seed only. Never replace after the user has typed or focused. */
export function keepDetailsDraft(
  current: DetailsDraft | null,
  source: Parameters<typeof draftFromSource>[0],
  userTouched: boolean,
): DetailsDraft | null {
  if (userTouched && current) {
    return current;
  }
  return current ?? draftFromSource(source);
}
