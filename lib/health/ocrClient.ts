import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { supabase } from '@/lib/supabase';
import { isOcrSpaHtml, isProjectStorageImageUrl } from '@/lib/health/ocrAllowlist';
import { ocrEndpoint } from '@/lib/health/ocrEndpoint';
import { hasOcrNumbers, type ParsedWorkoutOcr } from '@/lib/health/workoutOcr';

/**
 * Client for the workout-screenshot reader.
 *
 * The endpoint lives on Vercel rather than Supabase because Tesseract needs worker threads and real
 * CPU, and the Supabase Edge runtime provides neither. iOS, Android and Web all call this same URL,
 * so the chips are identical on all three.
 */

export type OcrReadResult = {
  /** True only when numbers came back. Everything else is a soft failure. */
  ok: boolean;
  isWorkoutScreen: boolean;
  reason: string;
  parsed?: ParsedWorkoutOcr;
  status?: number;
};

export { ocrEndpoint };

const TIMEOUT_MS = 45_000;

/** Wide enough for Tesseract to read phone-screenshot type, small enough to post quickly. */
const OCR_MAX_WIDTH = 1400;

function logOcr(input: {
  reachable: boolean;
  status: number;
  ok: boolean;
  ms: number;
  slot?: string | null;
  urls: string[];
  parsed?: ParsedWorkoutOcr | null;
  reason?: string;
}) {
  console.log('[blob:ocr]', {
    reachable: input.reachable,
    status: input.status,
    ok: input.ok,
    ms: input.ms,
    slot: input.slot ?? null,
    urls: input.urls,
    parsed: input.parsed ?? null,
    ...(input.reason ? { reason: input.reason } : null),
  });
}

function miss(
  reason: string,
  started: number,
  urls: string[],
  slot?: string | null,
  status = 0,
  reachable = false,
): OcrReadResult {
  logOcr({
    reachable,
    status,
    ok: false,
    ms: Date.now() - started,
    slot,
    urls,
    reason,
  });
  return { ok: false, isWorkoutScreen: false, reason, status };
}

/**
 * Reads the still as a downscaled JPEG. Same call on iOS, Android and Web — image-manipulator has a
 * web implementation, so there is no platform branch here.
 */
async function readImageBase64(uri: string): Promise<string | null> {
  try {
    const rendered = await ImageManipulator.manipulate(uri).resize({ width: OCR_MAX_WIDTH }).renderAsync();
    const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9, base64: true });
    return saved.base64 ? saved.base64 : null;
  } catch {
    return null;
  }
}

/**
 * Reads a workout screenshot. Never throws: a failure here must not block Send, because the photo
 * itself is the proof and the numbers are a bonus.
 *
 * Pass `localUri` for a still that is still on the hero and not yet uploaded, or `imageUrl` for one
 * already in this project's Storage. Bytes first; a Storage URL is only used when it is ours.
 */
export async function readWorkoutScreenshot(input: {
  localUri?: string;
  imageUrl?: string;
  slot?: string | null;
}): Promise<OcrReadResult> {
  const started = Date.now();
  const rawUrl = String(input.imageUrl ?? '').trim();
  const localUri = String(input.localUri ?? '').trim();
  const storageUrl = isProjectStorageImageUrl(rawUrl)
    ? rawUrl
    : isProjectStorageImageUrl(localUri)
      ? localUri
      : '';
  const urls = [storageUrl || rawUrl || localUri].filter(Boolean);
  const slot = input.slot ?? null;

  // Bytes first (the still on the hero). A Storage URL is only posted when encode fails
  // and the URL is this project's host.
  let imageBase64: string | null = null;
  if (localUri) {
    imageBase64 = await readImageBase64(localUri);
  }

  if (!imageBase64 && !storageUrl) {
    return miss(localUri ? 'unreadable_image' : 'no_image', started, urls, slot, 0, false);
  }

  let token: string | undefined;
  try {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token;
  } catch {
    token = undefined;
  }
  if (!token) {
    return miss('unauthorized', started, urls, slot, 0, false);
  }

  const endpoint = ocrEndpoint();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(imageBase64 ? { imageBase64 } : { imageUrl: storageUrl }),
      signal: controller.signal,
    });
    const raw = await response.text();
    if (isOcrSpaHtml(response.headers.get('content-type'), raw)) {
      return miss('spa_html', started, urls, slot, response.status, false);
    }
    let body: OcrReadResult;
    try {
      body = JSON.parse(raw) as OcrReadResult;
    } catch {
      return miss('bad_json', started, urls, slot, response.status, response.status !== 404);
    }
    if (!response.ok) {
      const reason =
        typeof body?.reason === 'string' && body.reason.trim()
          ? body.reason
          : `http_${response.status}`;
      return miss(reason, started, urls, slot, response.status, true);
    }
    const parsed = body?.parsed;
    const result: OcrReadResult = {
      ok: Boolean(body?.ok),
      isWorkoutScreen: Boolean(body?.isWorkoutScreen),
      reason: typeof body?.reason === 'string' ? body.reason : 'ok',
      parsed,
      status: response.status,
    };
    const ok = result.ok && result.isWorkoutScreen && hasOcrNumbers(parsed);
    logOcr({
      reachable: true,
      status: response.status,
      ok,
      ms: Date.now() - started,
      slot,
      urls,
      parsed: parsed ?? null,
      reason: ok
        ? undefined
        : !result.ok
          ? result.reason || 'ocr_failed'
          : result.isWorkoutScreen
            ? 'parse_miss'
            : result.reason || 'not_workout',
    });
    return result;
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return miss(aborted ? 'timeout' : 'network', started, urls, slot, 0, false);
  } finally {
    clearTimeout(timer);
  }
}
