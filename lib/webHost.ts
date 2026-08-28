export const BLOB_APEX_HOST = 'blob.mobi';
export const BLOB_WWW_HOST = 'www.blob.mobi';

export function isBlobWwwHost(hostname: string | null | undefined): boolean {
  return String(hostname ?? '').toLowerCase() === BLOB_WWW_HOST;
}

/** Rewrite www.blob.mobi → https://blob.mobi so camera / auth permission chrome never says www. */
export function apexBlobUrl(value: string): string {
  try {
    const parsed = new URL(value);
    if (!isBlobWwwHost(parsed.hostname)) {
      return value;
    }
    parsed.protocol = 'https:';
    parsed.hostname = BLOB_APEX_HOST;
    return parsed.toString();
  } catch {
    return value;
  }
}

export function apexBlobOrigin(origin: string): string {
  try {
    const parsed = new URL(origin);
    if (!isBlobWwwHost(parsed.hostname)) {
      return parsed.origin;
    }
    parsed.protocol = 'https:';
    parsed.hostname = BLOB_APEX_HOST;
    return parsed.origin;
  } catch {
    return origin;
  }
}

export function canonicalizeWwwBlobHost(): boolean {
  if (typeof window === 'undefined' || !window.location) {
    return false;
  }
  if (!isBlobWwwHost(window.location.hostname)) {
    return false;
  }
  window.location.replace(apexBlobUrl(window.location.href));
  return true;
}
