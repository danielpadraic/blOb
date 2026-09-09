import { BLOB_APEX_HOST } from '@/lib/webHost';

/**
 * Absolute apex URL on iOS, Android, and Web.
 *
 * Expo web on Vercel rewrites unknown paths into the SPA. A relative `/api/ocr-workout` can land on
 * index.html instead of the Vercel function. blob.mobi/api/ocr-workout is the function that survives
 * `npx expo export --platform web`.
 */
export function ocrEndpoint(): string {
  return `https://${BLOB_APEX_HOST}/api/ocr-workout`;
}
