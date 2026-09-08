/**
 * Only this project's Storage host may be fetched by the OCR function.
 * Shared by the Vercel handler and the client so a signed proof URL is accepted
 * the same way on iOS, Android and Web.
 */

export function isAllowedOcrImageUrl(raw: string, supabaseUrl: string): boolean {
  let url: URL;
  let base: URL;
  try {
    url = new URL(raw);
    base = new URL(supabaseUrl);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') {
    return false;
  }
  if (url.hostname.toLowerCase() !== base.hostname.toLowerCase()) {
    return false;
  }
  return url.pathname.startsWith('/storage/v1/');
}

export function projectStorageUrl(): string {
  return String(process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
}

export function isProjectStorageImageUrl(raw: string): boolean {
  return isAllowedOcrImageUrl(raw, projectStorageUrl());
}

/** The Expo SPA HTML, which must never be treated as an OCR JSON payload. */
export function isOcrSpaHtml(contentType: string | null, body: string): boolean {
  const type = String(contentType ?? '').toLowerCase();
  if (type.includes('text/html') || type.includes('application/xhtml')) {
    return true;
  }
  const trimmed = body.trimStart().slice(0, 32).toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
}
