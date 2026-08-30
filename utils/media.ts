export type MediaKind = 'image' | 'video' | 'link' | 'file';

function pathOf(url: string): string {
  return url.toLowerCase().split('?')[0] ?? url.toLowerCase();
}

export function mediaKind(url: string): MediaKind {
  const path = pathOf(url);
  if (
    /\.(mp4|mov|m4v|webm)$/.test(path) ||
    /\/video-\d+\./.test(path) ||
    /\/reels\//.test(path)
  ) {
    return 'video';
  }
  if (/\.(png|jpe?g|webp|gif|heic|heif)$/.test(path)) {
    return 'image';
  }
  if (/tenor\.com|giphy\.com|gph\.is/.test(path)) {
    return 'image';
  }
  if (/\.(pdf|txt|csv|zip|docx?)$/.test(path) || /\/object\/public\/post-media\/[^/]+\/files\//.test(path)) {
    return 'file';
  }
  if (
    /\/object\/public\/post-media\//.test(path) ||
    /\/object\/public\/avatars\//.test(path) ||
    /\/storage\/v1\/object\//.test(path)
  ) {
    return 'image';
  }
  if (/^https?:\/\//.test(url)) {
    return 'link';
  }
  return 'image';
}

const GALLERY_IMAGE_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/pjpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const GALLERY_VIDEO_MIME = new Set([
  'video/mp4',
  'video/quicktime',
  'video/x-m4v',
  'video/webm',
]);

export type GalleryMediaKind = 'photo' | 'video';

/** JPEG/PNG/WebP/HEIC stills and MP4/MOV (plus WebM on web). PDF/zip/doc/GIF are not gallery media. */
export function asGalleryMedia(input: {
  mimeType?: string | null;
  fileName?: string | null;
  uri?: string | null;
  type?: string | null;
}): GalleryMediaKind | null {
  const mime = (input.mimeType ?? '').toLowerCase().split(';')[0]?.trim() ?? '';
  const name = `${input.fileName ?? ''} ${input.uri ?? ''}`.toLowerCase().split('?')[0] ?? '';
  const assetType = (input.type ?? '').toLowerCase();

  if (
    mime === 'application/pdf' ||
    mime === 'application/zip' ||
    mime.startsWith('application/msword') ||
    mime.includes('officedocument') ||
    mime === 'text/plain' ||
    mime === 'text/csv' ||
    /\.(pdf|zip|docx?|txt|csv)$/.test(name)
  ) {
    return null;
  }
  if (mime === 'image/gif' || name.endsWith('.gif')) {
    return null;
  }
  if (
    assetType === 'video' ||
    mime.startsWith('video/') ||
    /\.(mp4|mov|m4v|webm)$/.test(name)
  ) {
    if (mime && !GALLERY_VIDEO_MIME.has(mime)) {
      return null;
    }
    return 'video';
  }
  if (GALLERY_IMAGE_MIME.has(mime) || /\.(jpe?g|png|webp|heic|heif)$/.test(name)) {
    return 'photo';
  }
  if (assetType === 'image' || assetType === 'livephoto') {
    if (mime.startsWith('application/')) {
      return null;
    }
    return 'photo';
  }
  return null;
}

/** Safari gallery picks sometimes omit `uri` and only give `file`. */
export function localUriFromPickerAsset(asset: {
  uri?: string | null;
  file?: Blob | File | null;
}): string | null {
  const uri = String(asset.uri ?? '').trim();
  if (uri) {
    return uri;
  }
  const file = asset.file;
  if (file && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    try {
      return URL.createObjectURL(file);
    } catch {
      return null;
    }
  }
  return null;
}

export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Visual http(s) URLs embedded in a comment body (GIF / photo / video). */
export function commentMediaUrls(content: string): string[] {
  const matches = content.match(/https?:\/\/[^\s]+/g) ?? [];
  return matches.filter((url) => {
    const kind = mediaKind(url);
    return kind === 'image' || kind === 'video';
  });
}

export function commentTextWithoutMedia(content: string): string {
  const urls = new Set(commentMediaUrls(content));
  if (urls.size === 0) {
    return content;
  }
  return content
    .split('\n')
    .map((line) =>
      line
        .split(/\s+/)
        .filter((part) => !urls.has(part))
        .join(' ')
        .trim(),
    )
    .filter(Boolean)
    .join('\n');
}

export function displayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`.replace(/\/$/, '');
  } catch {
    return url;
  }
}
