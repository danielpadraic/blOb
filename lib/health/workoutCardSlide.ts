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

/** The on-device raster (`blob-workout-proof-…`). It is not a selfie and not the stored card. */
export function isLocalWorkoutRaster(url?: string | null): boolean {
  return String(url ?? '').includes('blob-workout-proof');
}

function isCardFile(url: string, cardUrl?: string | null): boolean {
  return (
    !url ||
    url.startsWith('health:') ||
    isWorkoutCardSlide(url) ||
    isWorkoutCardStoragePath(url) ||
    isLocalWorkoutRaster(url) ||
    isWorkoutCardUrl(url, cardUrl)
  );
}

/** Slot photos only. A recap file is not a pre, post, or HR photo. */
export function proofPartWithoutCardFile(
  part: Record<string, unknown>,
  cardUrl?: string | null,
): Record<string, unknown> {
  const currentUrl = String(part.url ?? '').trim();
  const listed = Array.isArray(part.urls) ? part.urls.map((item) => String(item ?? '')) : [];
  const stills = uniqueProofUrls([currentUrl, ...listed]).filter((url) => url && !isCardFile(url, cardUrl));
  const keepUrl = Boolean(currentUrl) && !isCardFile(currentUrl, cardUrl);
  return {
    ...part,
    url: keepUrl ? currentUrl : (stills[0] ?? ''),
    urls: stills,
  };
}

export function proofPartWithExtraCard(
  part: Record<string, unknown>,
  cardUrl: string,
  cardVersion: number,
): Record<string, unknown> {
  return {
    ...proofPartWithoutCardFile(part, cardUrl),
    cardUrl,
    cardVersion,
  };
}

export type WorkoutCardPostRef = {
  id: string;
  challengeId: string;
  checkinId: string;
};

/**
 * This room's Live post, plus the Official twin for the same Chicago day.
 * A post on any other challenge is left alone, even if it shares a check-in id.
 */
export function workoutCardPostIds(input: {
  challengeId: string;
  checkinId: string;
  siblingChallengeId?: string | null;
  siblingCheckinId?: string | null;
  posts: readonly WorkoutCardPostRef[];
}): string[] {
  const siblingChallenge = String(input.siblingChallengeId ?? '').trim();
  const siblingCheckin = String(input.siblingCheckinId ?? '').trim();
  const ids: string[] = [];
  for (const post of input.posts) {
    const sameRoom = post.challengeId === input.challengeId && post.checkinId === input.checkinId;
    const twinRoom =
      Boolean(siblingChallenge) &&
      post.challengeId === siblingChallenge &&
      (post.checkinId === input.checkinId || (Boolean(siblingCheckin) && post.checkinId === siblingCheckin));
    if ((sameRoom || twinRoom) && !ids.includes(post.id)) {
      ids.push(post.id);
    }
  }
  return ids;
}

/** Uploaded copy of the on-device raster. Only a duplicate when that local file is also on the post. */
function isUploadedRasterExtra(url: string): boolean {
  return /\/checkin-extra-\d+-\d+\.(jpe?g|png|webp)$/i.test(String(url ?? '').split('?')[0]);
}

/**
 * Selfies and screenshots stay. One recap, last.
 * Drops extra `workout_card-` files and the local raster that was copied into the slides.
 */
export function collapseRecapSlides(
  urls: Array<string | null | undefined> | null | undefined,
  cardUrl?: string | null,
): string[] {
  const list = uniqueProofUrls(urls);
  const hasLocal = list.some((url) => isLocalWorkoutRaster(url));
  const cards = list.filter(
    (url) => isWorkoutCardStoragePath(url) || isWorkoutCardUrl(url, cardUrl) || isWorkoutCardSlide(url),
  );
  const named = String(cardUrl ?? '').split('?')[0];
  const keep =
    cards.find((url) => named && url.split('?')[0] === named) ?? cards[cards.length - 1] ?? '';
  const stills = list.filter((url) => {
    if (isLocalWorkoutRaster(url) || isWorkoutCardStoragePath(url) || isWorkoutCardSlide(url)) {
      return false;
    }
    if (keep && isWorkoutCardUrl(url, keep)) {
      return false;
    }
    if (hasLocal && isUploadedRasterExtra(url)) {
      return false;
    }
    return true;
  });
  return keep ? uniqueProofUrls([...stills, keep]) : stills;
}

/** Existing stills, then one recap. An older workout_card file is replaced, not stacked. */
export function mediaWithExtraCard(
  urls: Array<string | null | undefined> | null | undefined,
  cardUrl: string,
): string[] {
  const stills = collapseRecapSlides(urls, cardUrl).filter(
    (url) => !isWorkoutCardSlide(url) && !isWorkoutCardStoragePath(url) && !isWorkoutCardUrl(url, cardUrl),
  );
  return uniqueProofUrls([...stills, cardUrl]);
}
