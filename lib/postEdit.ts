import { uniqueProofUrls, type ChallengeProof, type ChallengeProofPart } from '@/lib/challengeProofs';

export type PostEditHistoryRow = {
  caption: string;
  created_at: string;
};

export function hiddenMediaSet(urls?: string[] | null): Set<string> {
  return new Set(uniqueProofUrls(urls ?? []));
}

export function isHiddenMedia(url: string, hidden?: string[] | null): boolean {
  return hiddenMediaSet(hidden).has(url.trim());
}

export function visiblePostMedia(urls?: string[] | null, hidden?: string[] | null): string[] {
  const skip = hiddenMediaSet(hidden);
  return uniqueProofUrls(urls ?? []).filter((url) => !skip.has(url));
}

export function requiredProofUrls(
  proofs: ChallengeProof[],
  parts?: Record<string, ChallengeProofPart> | null,
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const proof of proofs) {
    const part = parts?.[proof.id];
    const current = part?.url?.trim();
    const urls = uniqueProofUrls([current, ...(part?.urls ?? [])]);
    if (urls.length > 0) {
      out[proof.id] = current ? [current] : urls;
    }
  }
  return out;
}

export function canHideCheckinUrl(input: {
  url: string;
  hidden: string[];
  replacements?: Record<string, string>;
  required: Record<string, string[]>;
}): boolean {
  const nextHidden = hiddenMediaSet([...input.hidden, input.url]);
  for (const [proofId, urls] of Object.entries(input.required)) {
    const replacement = input.replacements?.[proofId]?.trim();
    const visible = urls.filter((url) => !nextHidden.has(url));
    if (replacement && !nextHidden.has(replacement)) {
      continue;
    }
    if (visible.length === 0) {
      return false;
    }
  }
  return true;
}

export function parsePostEdits(rows: unknown): PostEditHistoryRow[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows
    .map((row) => {
      if (!row || typeof row !== 'object') {
        return null;
      }
      const caption = String((row as { caption?: unknown }).caption ?? '').trim();
      const created = String((row as { created_at?: unknown }).created_at ?? '').trim();
      if (!created) {
        return null;
      }
      return { caption, created_at: created };
    })
    .filter((row): row is PostEditHistoryRow => Boolean(row));
}
