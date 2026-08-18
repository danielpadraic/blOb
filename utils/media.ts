export type MediaKind = 'image' | 'video' | 'link' | 'file';

function pathOf(url: string): string {
  return url.toLowerCase().split('?')[0] ?? url.toLowerCase();
}

export function mediaKind(url: string): MediaKind {
  const path = pathOf(url);
  if (/\.(mp4|mov|m4v|webm)$/.test(path) || /\/video-\d+\./.test(path)) {
    return 'video';
  }
  if (/\.(png|jpe?g|webp|gif|heic|heif)$/.test(path)) {
    return 'image';
  }
  if (/\/object\/public\/post-media\//.test(path) || /\/object\/public\/avatars\//.test(path)) {
    return 'image';
  }
  if (/\.(pdf|txt|csv|zip|docx?)$/.test(path)) {
    return 'file';
  }
  if (/^https?:\/\//.test(url)) {
    return 'link';
  }
  return 'image';
}

export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function displayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.host}${parsed.pathname}`.replace(/\/$/, '');
  } catch {
    return url;
  }
}
