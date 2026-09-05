import { Jimp } from 'jimp';
import { createWorker, PSM, type Worker } from 'tesseract.js';

/**
 * Tesseract + image preprocessing, shared by the live OCR endpoint and the backfill job.
 *
 * This runs on Vercel Functions rather than a Supabase Edge Function on purpose: Tesseract needs
 * worker threads and real CPU, and the Supabase Edge runtime provides neither (no Web Worker API,
 * 2s CPU ceiling per request).
 */

const MAX_BYTES = 12 * 1024 * 1024;

/** Tesseract works far better on tall crisp text, and phone screenshots come in small. */
const TARGET_WIDTH = 1400;

let workerPromise: Promise<Worker> | null = null;

/**
 * One warm worker per function instance. Creating a worker loads a ~2MB wasm core plus the
 * language data, which is far too expensive to repeat per image.
 */
async function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      // /tmp survives between warm invocations, so the language data downloads once per instance.
      cachePath: '/tmp',
    });
  }
  return workerPromise;
}

export type PreparedImage = { buffer: Buffer; inverted: boolean; width: number; height: number };

/**
 * Apple Fitness, the Watch summary and Strava all render light text on near-black. Tesseract is
 * trained on dark-on-light, so a dark screenshot is inverted before recognition. Without this step
 * the numerals we care about are frequently missed entirely.
 */
export async function prepareImage(input: ArrayBuffer | Buffer): Promise<PreparedImage> {
  const image = await Jimp.read(Buffer.isBuffer(input) ? input : Buffer.from(input));

  if (image.bitmap.width < TARGET_WIDTH) {
    image.scaleToFit({ w: TARGET_WIDTH, h: TARGET_WIDTH * 4 });
  }
  image.greyscale();

  const inverted = meanBrightness(image) < 110;
  if (inverted) {
    image.invert();
  }
  // Push mid grays apart so anti-aliased numerals resolve to solid strokes.
  image.contrast(0.35);

  const buffer = await image.getBuffer('image/png');
  return { buffer, inverted, width: image.bitmap.width, height: image.bitmap.height };
}

/** Average luminance of a greyscale bitmap, sampled on a grid to stay cheap on large images. */
export function meanBrightness(image: { bitmap: { data: Buffer | Uint8Array; width: number; height: number } }): number {
  const { data, width, height } = image.bitmap;
  const stepX = Math.max(1, Math.floor(width / 64));
  const stepY = Math.max(1, Math.floor(height / 64));
  let total = 0;
  let samples = 0;
  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      total += data[(y * width + x) * 4];
      samples += 1;
    }
  }
  return samples === 0 ? 255 : total / samples;
}

export type OcrResult = { text: string; inverted: boolean };

/** Downloads, preprocesses and recognizes one image. Throws only on unusable input. */
export async function ocrImageFromUrl(url: string): Promise<OcrResult> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`could not fetch image (${response.status})`);
  }
  const length = Number(response.headers.get('content-length') ?? 0);
  if (length > MAX_BYTES) {
    throw new Error('image too large');
  }
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength === 0) {
    throw new Error('empty image');
  }
  if (bytes.byteLength > MAX_BYTES) {
    throw new Error('image too large');
  }
  return ocrImageBuffer(bytes);
}

export async function ocrImageBuffer(bytes: ArrayBuffer | Buffer): Promise<OcrResult> {
  const prepared = await prepareImage(bytes);
  const worker = await getWorker();
  // Sparse-text segmentation: workout summaries are scattered stat cards, not paragraphs.
  await worker.setParameters({
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    preserve_interword_spaces: '1',
  });
  const { data } = await worker.recognize(prepared.buffer);
  return { text: String(data?.text ?? ''), inverted: prepared.inverted };
}
