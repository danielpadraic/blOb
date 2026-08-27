import { mediaUrlKey, uniqueProofUrls, type ChallengeProof, type ChallengeProofPart } from '@/lib/challengeProofs';

export type PostEditHistoryRow = {
  caption: string;
  created_at: string;
};

export function hiddenMediaSet(urls?: string[] | null): Set<string> {
  return new Set(uniqueProofUrls(urls ?? []).map((url) => mediaUrlKey(url)));
}

export function isHiddenMedia(url: string, hidden?: string[] | null): boolean {
  return hiddenMediaSet(hidden).has(mediaUrlKey(url));
}

export function visiblePostMedia(urls?: string[] | null, hidden?: string[] | null): string[] {
  const skip = hiddenMediaSet(hidden);
  return uniqueProofUrls(urls ?? []).filter((url) => !skip.has(mediaUrlKey(url)));
}

export function hiddenUrlsFromParts(
  parts?: Record<string, ChallengeProofPart> | null,
): string[] {
  if (!parts) {
    return [];
  }
  const urls: string[] = [];
  for (const part of Object.values(parts)) {
    if (!part) {
      continue;
    }
    urls.push(...(part.hidden_urls ?? []));
  }
  return uniqueProofUrls(urls);
}

export function isPersistedMediaUrl(url: string): boolean {
  return /^https?:\/\//i.test(url.trim());
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

/** Extra check-in photos may leave the post if every required category still has a file. */
export function canRemoveCheckinExtra(input: {
  url: string;
  mediaUrls: string[];
  required: Record<string, string[]>;
}): boolean {
  const remaining = uniqueProofUrls(input.mediaUrls.filter((item) => item !== input.url));
  for (const urls of Object.values(input.required)) {
    if (urls.length === 0) {
      continue;
    }
    if (!urls.some((url) => remaining.includes(url))) {
      return false;
    }
  }
  return true;
}

export function sameUrlList(left: string[], right: string[]): boolean {
  const a = uniqueProofUrls(left);
  const b = uniqueProofUrls(right);
  return a.length === b.length && a.every((url, index) => url === b[index]);
}

export function postEditUnchanged(input: {
  caption: string;
  originalCaption: string;
  mediaUrls: string[];
  originalMediaUrls: string[];
  hidden: string[];
  originalHidden: string[];
  hiddenFromHome?: boolean;
  originalHiddenFromHome?: boolean;
}): boolean {
  return (
    input.caption.trim() === input.originalCaption.trim() &&
    sameUrlList(input.mediaUrls, input.originalMediaUrls) &&
    sameUrlList(input.hidden, input.originalHidden) &&
    Boolean(input.hiddenFromHome) === Boolean(input.originalHiddenFromHome)
  );
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
