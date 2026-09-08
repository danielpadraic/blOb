import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';
import { BLOB_APEX_HOST } from '@/lib/webHost';
import { isOcrSpaHtml, isProjectStorageImageUrl } from '@/lib/health/ocrAllowlist';
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

/** Relative on Web so previews and local dev hit their own origin; absolute on native. */
export function ocrEndpoint(): string {
  if (Platform.OS === 'web') {
    return '/api/ocr-workout';
  }
  return `https://${BLOB_APEX_HOST}/api/ocr-workout`;
}

const TIMEOUT_MS = 45_000;

/** Wide enough for Tesseract to read phone-screenshot type, small enough to post quickly. */
const OCR_MAX_WIDTH = 1400;

function logOcrMiss(input: { reason: string; status: number; endpoint: string }) {
  console.log('[blob:ocr]', {
    reason: input.reason,
    status: input.status,
    endpoint: input.endpoint,
  });
}

function miss(reason: string, status = 0): OcrReadResult {
  const endpoint = ocrEndpoint();
  logOcrMiss({ reason, status, endpoint });
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
}): Promise<OcrReadResult> {
  const rawUrl = String(input.imageUrl ?? '').trim();
  const localUri = String(input.localUri ?? '').trim();
  const storageUrl = isProjectStorageImageUrl(rawUrl)
    ? rawUrl
    : isProjectStorageImageUrl(localUri)
      ? localUri
      : '';

  // Bytes first (the still on the hero). A Storage URL is only posted when encode fails
  // and the URL is this project's host.
  let imageBase64: string | null = null;
  if (localUri) {
    imageBase64 = await readImageBase64(localUri);
  }

  if (!imageBase64 && !storageUrl) {
    return miss(localUri ? 'unreadable_image' : 'no_image');
  }

  let token: string | undefined;
  try {
    const { data } = await supabase.auth.getSession();
    token = data.session?.access_token;
  } catch {
    token = undefined;
  }
  if (!token) {
    return miss('unauthorized');
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
      return miss('spa_html', response.status);
    }
    let body: OcrReadResult;
    try {
      body = JSON.parse(raw) as OcrReadResult;
    } catch {
      return miss('bad_json', response.status);
    }
    if (!response.ok) {
      const reason =
        typeof body?.reason === 'string' && body.reason.trim()
          ? body.reason
          : `http_${response.status}`;
      return miss(reason, response.status);
    }
    const parsed = body?.parsed;
    const result: OcrReadResult = {
      ok: Boolean(body?.ok),
      isWorkoutScreen: Boolean(body?.isWorkoutScreen),
      reason: typeof body?.reason === 'string' ? body.reason : 'ok',
      parsed,
      status: response.status,
    };
    if (!result.ok || !result.isWorkoutScreen || !hasOcrNumbers(parsed)) {
      logOcrMiss({
        reason: !result.ok
          ? result.reason || 'ocr_failed'
          : result.isWorkoutScreen
            ? 'parse_miss'
            : result.reason || 'not_workout',
        status: response.status,
        endpoint,
      });
    }
    return result;
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError';
    return miss(aborted ? 'timeout' : 'network');
  } finally {
    clearTimeout(timer);
  }
}
