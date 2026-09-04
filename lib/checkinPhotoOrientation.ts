import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

export type CheckinDeviceOrientation = 'portrait' | 'landscape';

export type CheckinStill = {
  uri: string;
  mimeType?: string | null;
  blob?: Blob | null;
};

/** Screen / window snapshot used when the page itself cannot rotate (iPhone Safari). */
export function checkinDeviceOrientation(input: {
  screenType?: string | null;
  screenAngle?: number | null;
  windowWidth?: number;
  windowHeight?: number;
}): CheckinDeviceOrientation {
  const type = String(input.screenType ?? '').toLowerCase();
  const wide = (input.windowWidth ?? 0) > (input.windowHeight ?? 0) * 1.02;
  if (type.startsWith('landscape')) {
    return 'landscape';
  }
  if (type.startsWith('portrait')) {
    return wide ? 'landscape' : 'portrait';
  }
  const angle = Math.abs(Number(input.screenAngle) || 0) % 360;
  if (angle === 90 || angle === 270) {
    return 'landscape';
  }
  return wide ? 'landscape' : 'portrait';
}

/** Degrees to CSS-rotate the live preview when the UI stays portrait. */
export function checkinPreviewRotateDeg(input: {
  device: CheckinDeviceOrientation;
  layoutWidth: number;
  layoutHeight: number;
  screenAngle?: number | null;
}): number {
  const layoutPortrait = input.layoutHeight >= input.layoutWidth;
  if (input.device !== 'landscape' || !layoutPortrait) {
    return 0;
  }
  const angle = Number(input.screenAngle);
  if (angle === -90 || angle === 270) {
    return -90;
  }
  return 90;
}

export function exifOrientationToDegrees(orientation?: number | null): number {
  if (orientation === 3) {
    return 180;
  }
  if (orientation === 6) {
    return 90;
  }
  if (orientation === 8) {
    return 270;
  }
  return 0;
}

export function normalizeDegrees(value: number): number {
  return ((Math.round(value) % 360) + 360) % 360;
}

/** Native manipulator / expo-image bake EXIF. Web canvas does not — apply EXIF + preview compensation. */
export function checkinStillRotateDegrees(input: {
  platform: 'web' | 'native';
  exifOrientation?: number | null;
  previewRotateDeg?: number;
}): number {
  const extra = normalizeDegrees(input.previewRotateDeg ?? 0);
  if (input.platform === 'native') {
    return extra;
  }
  return normalizeDegrees(exifOrientationToDegrees(input.exifOrientation) + extra);
}

/** Do not double-rotate a getUserMedia frame that is already landscape. */
export function checkinWebSnapRotateDegrees(input: {
  pixelWidth: number;
  pixelHeight: number;
  previewRotateDeg: number;
}): number {
  if (!input.previewRotateDeg) {
    return 0;
  }
  if (input.pixelWidth > input.pixelHeight * 1.02) {
    return 0;
  }
  return input.previewRotateDeg;
}

export function readJpegExifOrientation(bytes: ArrayBuffer | Uint8Array): number | null {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (view.length < 4 || view[0] !== 0xff || view[1] !== 0xd8) {
    return null;
  }
  let offset = 2;
  while (offset + 4 < view.length) {
    if (view[offset] !== 0xff) {
      break;
    }
    const marker = view[offset + 1];
    const size = (view[offset + 2] << 8) | view[offset + 3];
    if (marker === 0xe1 && offset + 4 + 6 < view.length) {
      return readExifOrientationAt(view, offset + 4, size);
    }
    if (marker === 0xda) {
      break;
    }
    offset += 2 + size;
  }
  return null;
}

function readExifOrientationAt(view: Uint8Array, start: number, size: number): number | null {
  const end = Math.min(view.length, start + size);
  if (start + 8 > end) {
    return null;
  }
  const header = String.fromCharCode(view[start], view[start + 1], view[start + 2], view[start + 3]);
  if (header !== 'Exif') {
    return null;
  }
  const tiff = start + 6;
  const little = view[tiff] === 0x49 && view[tiff + 1] === 0x49;
  const get16 = (at: number) =>
    little ? view[at] | (view[at + 1] << 8) : (view[at] << 8) | view[at + 1];
  const get32 = (at: number) =>
    little
      ? view[at] | (view[at + 1] << 8) | (view[at + 2] << 16) | (view[at + 3] << 24)
      : (view[at] << 24) | (view[at + 1] << 16) | (view[at + 2] << 8) | view[at + 3];
  if (get16(tiff + 2) !== 0x002a) {
    return null;
  }
  const ifd = tiff + get32(tiff + 4);
  if (ifd + 2 > end) {
    return null;
  }
  const count = get16(ifd);
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) {
      break;
    }
    if (get16(entry) === 0x0112) {
      return get16(entry + 8);
    }
  }
  return null;
}

async function bytesFromStill(input: CheckinStill): Promise<Uint8Array | null> {
  try {
    if (input.blob && input.blob.size > 16) {
      return new Uint8Array(await input.blob.arrayBuffer());
    }
    if (!input.uri) {
      return null;
    }
    const response = await fetch(input.uri);
    if (!response.ok) {
      return null;
    }
    return new Uint8Array(await response.arrayBuffer());
  } catch {
    return null;
  }
}

async function rotateOnWeb(input: CheckinStill, degrees: number): Promise<CheckinStill> {
  const doc = (globalThis as { document?: { createElement?: (tag: string) => unknown } }).document;
  if (!doc?.createElement || degrees === 0) {
    return { ...input, mimeType: input.mimeType ?? 'image/jpeg' };
  }
  const source = input.blob && input.blob.size > 16 ? input.blob : await (await fetch(input.uri)).blob();
  const bitmap = await createImageBitmap(source);
  const swap = degrees === 90 || degrees === 270;
  const canvas = doc.createElement('canvas') as HTMLCanvasElement;
  canvas.width = swap ? bitmap.height : bitmap.width;
  canvas.height = swap ? bitmap.width : bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    return input;
  }
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close?.();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob) {
    return input;
  }
  const uri = URL.createObjectURL(blob);
  return { uri, mimeType: 'image/jpeg', blob };
}

async function bakeOnNative(input: CheckinStill, degrees: number): Promise<CheckinStill> {
  const rendered =
    degrees === 0
      ? await ImageManipulator.manipulate(input.uri).renderAsync()
      : await ImageManipulator.manipulate(input.uri).rotate(degrees).renderAsync();
  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: 0.8,
  });
  if (!saved.uri) {
    return input;
  }
  return { uri: saved.uri, mimeType: 'image/jpeg', blob: null };
}

/** Bake EXIF / preview compensation so the composer contain preview is upright. */
export async function normalizeCheckinStill(
  input: CheckinStill & {
    previewRotateDeg?: number;
  },
): Promise<CheckinStill> {
  const mime = String(input.mimeType ?? '').toLowerCase();
  if (mime.startsWith('video/') || mime === 'image/gif') {
    return input;
  }
  try {
    const bytes = await bytesFromStill(input);
    const exif = bytes ? readJpegExifOrientation(bytes) : null;
    const platform = Platform.OS === 'web' ? 'web' : 'native';
    const degrees = checkinStillRotateDegrees({
      platform,
      exifOrientation: exif,
      previewRotateDeg: input.previewRotateDeg,
    });
    if (degrees === 0) {
      return { uri: input.uri, mimeType: input.mimeType ?? 'image/jpeg', blob: input.blob };
    }
    if (platform === 'web') {
      return await rotateOnWeb(input, degrees);
    }
    return await bakeOnNative(input, degrees);
  } catch {
    return input;
  }
}

export function readWebOrientationSnapshot(): {
  screenType: string | null;
  screenAngle: number | null;
  windowWidth: number;
  windowHeight: number;
} {
  const empty = { screenType: null, screenAngle: null, windowWidth: 0, windowHeight: 0 };
  if (typeof window === 'undefined') {
    return empty;
  }
  try {
    const screen = (window as { screen?: { orientation?: { type?: string; angle?: number } } }).screen;
    const type = screen?.orientation?.type ?? null;
    const windowAngle = (window as { orientation?: number }).orientation;
    const angle =
      typeof screen?.orientation?.angle === 'number'
        ? screen.orientation.angle
        : typeof windowAngle === 'number'
          ? windowAngle
          : null;
    return {
      screenType: type,
      screenAngle: angle,
      windowWidth: typeof window.innerWidth === 'number' ? window.innerWidth : 0,
      windowHeight: typeof window.innerHeight === 'number' ? window.innerHeight : 0,
    };
  } catch {
    return empty;
  }
}
