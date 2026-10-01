import { uniqueProofUrls } from '@/lib/challengeProofs';
import {
  isWorkoutCardSlide,
  isWorkoutCardStoragePath,
  isWorkoutCardUrl,
} from '@/lib/health/postWorkoutCard';

/**
 * The recap JPEG is an extra last slide. Selfies and screenshots stay where they are.
 * One `workout_card-` file per check-in.
 */

export function proofPartWithExtraCard(
  part: Record<string, unknown>,
  cardUrl: string,
  cardVersion: number,
): Record<string, unknown> {
  const currentUrl = String(part.url ?? '').trim();
  const listed = Array.isArray(part.urls) ? part.urls.map((item) => String(item ?? '')) : [];
  const stills = uniqueProofUrls([currentUrl, ...listed]).filter(
    (url) =>
      url &&
      !url.startsWith('health:') &&
      !isWorkoutCardSlide(url) &&
      !isWorkoutCardStoragePath(url) &&
      !isWorkoutCardUrl(url, cardUrl),
  );
  const keepUrl =
    Boolean(currentUrl) &&
    !currentUrl.startsWith('health:') &&
    !isWorkoutCardSlide(currentUrl) &&
    !isWorkoutCardStoragePath(currentUrl);
  return {
    ...part,
    url: keepUrl ? currentUrl : cardUrl,
    urls: uniqueProofUrls([...stills, cardUrl]),
    cardVersion,
  };
}

/** Existing stills, then one recap. An older workout_card file is replaced, not stacked. */
export function mediaWithExtraCard(
  urls: Array<string | null | undefined> | null | undefined,
  cardUrl: string,
): string[] {
  const stills = uniqueProofUrls(urls).filter(
    (url) => !isWorkoutCardSlide(url) && !isWorkoutCardStoragePath(url) && !isWorkoutCardUrl(url, cardUrl),
  );
  return uniqueProofUrls([...stills, cardUrl]);
}
