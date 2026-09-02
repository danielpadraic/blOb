const POSTER_PARAM = 'blob_poster';

export function videoPlaybackSrc(videoUrl: string | null | undefined): string {
  const raw = videoUrl?.trim() ?? '';
  if (!raw) {
    return '';
  }
  try {
    const parsed = new URL(raw);
    if (!parsed.searchParams.has(POSTER_PARAM)) {
      return raw;
    }
    parsed.searchParams.delete(POSTER_PARAM);
    return parsed.toString();
  } catch {
    return raw.replace(/([?&])blob_poster=[^&]*&?/, '$1').replace(/[?&]$/, '');
  }
}

export function storedVideoPoster(videoUrl: string | null | undefined): string | null {
  const raw = videoUrl?.trim();
  if (!raw) {
    return null;
  }
  try {
    const parsed = new URL(raw);
    return parsed.searchParams.get(POSTER_PARAM)?.trim() || null;
  } catch {
    const match = raw.match(/[?&]blob_poster=([^&]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : null;
  }
}

export function withStoredVideoPoster(
  videoUrl: string,
  posterUrl?: string | null,
): string {
  const poster = posterUrl?.trim();
  if (!poster) {
    return videoUrl;
  }
  try {
    const parsed = new URL(videoUrl);
    parsed.searchParams.set(POSTER_PARAM, poster);
    return parsed.toString();
  } catch {
    const join = videoUrl.includes('?') ? '&' : '?';
    return `${videoUrl}${join}${POSTER_PARAM}=${encodeURIComponent(poster)}`;
  }
}
