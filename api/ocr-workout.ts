import { isAllowedOcrImageUrl } from '../lib/health/ocrAllowlist';
import {
  classifyWorkoutScreen,
  dropOcrAvgIfAboveMax,
  hasOcrNumbers,
  mergeWorkoutOcr,
  ocrAvgExceedsMax,
  parseWorkoutOcrText,
  type ParsedWorkoutOcr,
} from '../lib/health/workoutOcr';
import { downloadImageBytes, ocrImageBuffer } from './_lib/ocrRunner';

/** Tesseract needs Node, not Edge. */
export const runtime = 'nodejs';

/**
 * Reads the numbers off a workout-summary screenshot.
 *
 * Stateless on purpose: it returns parsed fields and never writes. The client persists the session
 * at Send, so a correction the user typed into a chip wins over what OCR guessed.
 *
 * Needs no secret. The caller's own access token proves it is a real signed-in user, and it passes
 * either the bytes of the still on the hero or a signed Storage URL for one already uploaded.
 * Bytes matter because the composer reads a screenshot before Send, while the file is still local.
 */

// Tesseract on a phone screenshot takes seconds, not milliseconds.
export const maxDuration = 60;

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

type Body = { imageUrl?: unknown; imageBase64?: unknown };

/** Guards against a decode that would blow the function's memory. Screenshots are far smaller. */
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/** Accepts a bare base64 payload or a data URL. Returns null when it is not usable image bytes. */
export function decodeImageBase64(raw: string): Buffer | null {
  const trimmed = raw.trim();
  const body = trimmed.startsWith('data:') ? trimmed.slice(trimmed.indexOf(',') + 1) : trimmed;
  if (!body || !/^[A-Za-z0-9+/=\s]+$/.test(body)) {
    return null;
  }
  let bytes: Buffer;
  try {
    bytes = Buffer.from(body, 'base64');
  } catch {
    return null;
  }
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    return null;
  }
  return bytes;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
}

/**
 * Only ever fetches objects from this project's own Storage host. Without this the endpoint would
 * be an open fetch proxy that anyone could aim at an internal address.
 */
export function isAllowedImageUrl(raw: string, supabaseUrl: string): boolean {
  return isAllowedOcrImageUrl(raw, supabaseUrl);
}

/** Confirms the bearer token belongs to a real user. Uses the public anon key, not a secret. */
async function resolveUserId(authorization: string | null): Promise<string | null> {
  const token = (authorization ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return null;
  }
  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY },
  });
  if (!response.ok) {
    return null;
  }
  const user = (await response.json()) as { id?: string };
  return typeof user?.id === 'string' ? user.id : null;
}

export type OcrWorkoutResponse = {
  ok: boolean;
  isWorkoutScreen: boolean;
  reason: string;
  parsed?: ParsedWorkoutOcr;
};

export type OcrWorkoutRead = OcrWorkoutResponse & { inverted: boolean; pass: 1 | 2 };

/**
 * Pass 1: original polarity (current parser). Pass 2: grayscale + invert + contrast, in memory only.
 * Never writes the inverted pixels. Numbers from either pass are enough to treat the still as a
 * workout screen — the 2-signal classifier must not hide a compact Fitness summary.
 */
export async function ocrWorkoutFromBuffer(bytes: Buffer): Promise<OcrWorkoutRead> {
  const pass1 = await ocrImageBuffer(bytes, 'never');
  const parsed1 = parseWorkoutOcrText(pass1.text);
  if (hasOcrNumbers(parsed1) && !ocrAvgExceedsMax(parsed1)) {
    return { ok: true, isWorkoutScreen: true, reason: 'ok', parsed: parsed1, inverted: false, pass: 1 };
  }

  const pass2 = await ocrImageBuffer(bytes, 'always');
  const parsed2 = parseWorkoutOcrText(pass2.text);
  if (ocrAvgExceedsMax(parsed1) && (hasOcrNumbers(parsed1) || hasOcrNumbers(parsed2))) {
    return {
      ok: true,
      isWorkoutScreen: true,
      reason: 'ok',
      parsed: mergeWorkoutOcr(dropOcrAvgIfAboveMax(parsed1), parsed2),
      inverted: true,
      pass: 2,
    };
  }
  if (hasOcrNumbers(parsed2)) {
    return {
      ok: true,
      isWorkoutScreen: true,
      reason: 'ok',
      parsed: dropOcrAvgIfAboveMax(parsed2),
      inverted: true,
      pass: 2,
    };
  }

  const classification = classifyWorkoutScreen(`${pass1.text}\n${pass2.text}`);
  if (!classification.isWorkoutScreen) {
    return {
      ok: true,
      isWorkoutScreen: false,
      reason: classification.reason,
      inverted: true,
      pass: 2,
    };
  }
  return {
    ok: true,
    isWorkoutScreen: true,
    reason: 'ok',
    parsed: dropOcrAvgIfAboveMax(parsed1),
    inverted: true,
    pass: 2,
  };
}

/**
 * Exported as a named method so Vercel hands us a web-standard `Request`. A default export would be
 * invoked with Node's `IncomingMessage` instead, which has no `headers.get`.
 */
export async function POST(request: Request): Promise<Response> {
  const userId = await resolveUserId(request.headers.get('authorization'));
  if (!userId) {
    return json({ ok: false, reason: 'unauthorized' }, 401);
  }

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return json({ ok: false, reason: 'bad_json' }, 400);
  }

  const imageUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : '';
  const imageBase64 = typeof body.imageBase64 === 'string' ? body.imageBase64 : '';
  const bytes = imageBase64 ? decodeImageBase64(imageBase64) : null;

  if (!bytes) {
    if (imageBase64) {
      return json({ ok: false, reason: 'bad_image_bytes' }, 400);
    }
    // The URL path stays locked to this project's own Storage host.
    if (!imageUrl || !isAllowedImageUrl(imageUrl, SUPABASE_URL)) {
      return json({ ok: false, reason: 'bad_image_url' }, 400);
    }
  }

  try {
    const image = bytes ?? (await downloadImageBytes(imageUrl));
    const read = await ocrWorkoutFromBuffer(image);
    if (!read.isWorkoutScreen) {
      // A selfie or social photo in an HR slot is an expected outcome, not an error. The caller
      // shows no chips and Send stays available.
      return json({ ok: true, isWorkoutScreen: false, reason: read.reason });
    }
    return json({ ok: true, isWorkoutScreen: true, reason: 'ok', parsed: read.parsed });
  } catch (error) {
    // Soft failure: the photo is still valid proof, so the client must not block Send on this.
    return json(
      { ok: false, isWorkoutScreen: false, reason: error instanceof Error ? error.message : 'ocr_failed' },
      200,
    );
  }
}
