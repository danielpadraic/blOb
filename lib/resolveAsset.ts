import { Image } from 'react-native';

/**
 * Static `require()` PNGs. Never call resolveAssetSource on web — it is not a function there
 * and takes Home / Live down.
 */
export function imageSource(mod: number | string | object) {
  if (typeof mod === 'string') {
    return { uri: mod };
  }
  return mod;
}

export function imageUri(mod: number | string): string | null {
  if (typeof mod === 'string') {
    return mod;
  }
  const resolve = (Image as { resolveAssetSource?: (asset: number) => { uri?: string } | null })
    ?.resolveAssetSource;
  if (typeof resolve !== 'function') {
    return null;
  }
  try {
    return resolve(mod)?.uri ?? null;
  } catch {
    return null;
  }
}
