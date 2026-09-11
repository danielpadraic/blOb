import { uniqueProofUrls } from '@/lib/challengeProofs';
import { isRecapCardUrl } from '@/lib/health/postWorkoutCard';

/**
 * User Fitness stills first, rasterized recap last. Dedup by URL without the query token.
 * Never drops a still to make room for the card.
 */
export function screenshotUrlsBeforeCard(urls: string[]): string[] {
  const list = uniqueProofUrls(urls);
  const stills = list.filter((url) => !isRecapCardUrl(url));
  const cards = list.filter((url) => isRecapCardUrl(url));
  return uniqueProofUrls([...stills, ...cards]);
}

export function isUserScreenshotUrl(url?: string | null): boolean {
  const path = String(url ?? '').split('?')[0].toLowerCase();
  return /\.(jpe?g|heic|heif|webp)$/.test(path);
}
