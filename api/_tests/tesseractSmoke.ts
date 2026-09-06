/** True when Tesseract could not download its language data. Do not treat other OCR failures as this. */
export function tesseractCouldNotDownload(error: unknown): boolean {
  const text =
    error instanceof Error ? `${error.name} ${error.message} ${String(error.cause ?? '')}` : String(error);
  return /fetch failed|ENOTFOUND|ECONN|ETIMEDOUT|EAI_AGAIN|tessdata|failed to fetch|network|AbortError/i.test(
    text,
  );
}

const LANG_DATA_URL =
  'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz';

/** Probe the CDN Tesseract uses. Skip smoke tests when this cannot download. */
export async function tesseractLanguageReachable(ms = 8_000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    const response = await fetch(LANG_DATA_URL, { method: 'GET', signal: controller.signal });
    return response.ok;
  } catch (error) {
    console.warn(
      'OCR smoke skipped: Tesseract language data could not download.',
      error instanceof Error ? error.message : error,
    );
    return false;
  } finally {
    clearTimeout(timer);
  }
}
