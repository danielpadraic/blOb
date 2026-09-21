import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { LOBBY_COVER_ASPECT, centerCropRect } from '@/lib/lobbyCover';

export type CroppedLobbyCover = {
  uri: string;
  blob?: Blob | null;
};

const COVER_WIDTH = 1080;

const CROP_FAIL = 'We couldn’t crop that photo. Try a JPEG or PNG.';
const STICK_FAIL = 'That photo didn’t stick. Pick it again.';

type BitmapLike = {
  width: number;
  height: number;
  close?: () => void;
};

type WebCanvas = {
  width: number;
  height: number;
  getContext: (id: '2d') => {
    drawImage: (
      image: unknown,
      sx: number,
      sy: number,
      sw: number,
      sh: number,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
    ) => void;
  } | null;
  toBlob: (callback: (blob: Blob | null) => void, type?: string, quality?: number) => void;
};

function createObjectUrl(blob: Blob): string | null {
  return (
    globalThis as { URL?: { createObjectURL?: (next: Blob) => string } }
  ).URL?.createObjectURL?.(blob) ?? null;
}

async function bitmapFromBlob(blob: Blob): Promise<BitmapLike> {
  const createImageBitmap = (
    globalThis as { createImageBitmap?: (next: Blob) => Promise<BitmapLike> }
  ).createImageBitmap;
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob);
  }
  const objectUrl = createObjectUrl(blob);
  if (!objectUrl) {
    throw new Error(CROP_FAIL);
  }
  return bitmapFromUri(objectUrl);
}

async function bitmapFromUri(uri: string): Promise<BitmapLike> {
  const ImageCtor = (
    globalThis as {
      Image?: new () => {
        src: string;
        width: number;
        height: number;
        decode?: () => Promise<void>;
        onload: (() => void) | null;
        onerror: (() => void) | null;
      };
    }
  ).Image;
  if (!ImageCtor) {
    throw new Error(CROP_FAIL);
  }
  const image = new ImageCtor();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error(CROP_FAIL));
    image.src = uri;
    void image.decode?.().then(() => resolve()).catch(() => undefined);
  });
  return image;
}

async function rasterizeBitmap(
  bitmap: BitmapLike,
  input: { width?: number | null; height?: number | null },
): Promise<CroppedLobbyCover> {
  const width = Math.max(1, Math.round(bitmap.width || input.width || 1));
  const height = Math.max(1, Math.round(bitmap.height || input.height || 1));
  const crop = centerCropRect(width, height, LOBBY_COVER_ASPECT);
  const scale = COVER_WIDTH / crop.width;
  const outW = COVER_WIDTH;
  const outH = Math.max(1, Math.round(crop.height * scale));

  const doc = (globalThis as { document?: { createElement?: (tag: string) => unknown } }).document;
  const canvas = doc?.createElement?.('canvas') as WebCanvas | undefined;
  if (!canvas) {
    bitmap.close?.();
    throw new Error(CROP_FAIL);
  }
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    throw new Error(CROP_FAIL);
  }
  ctx.drawImage(bitmap, crop.originX, crop.originY, crop.width, crop.height, 0, 0, outW, outH);
  bitmap.close?.();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (next) => (next && next.size > 32 ? resolve(next) : reject(new Error(CROP_FAIL))),
      'image/jpeg',
      0.85,
    );
  });
  const objectUrl = createObjectUrl(blob);
  if (!objectUrl) {
    throw new Error(CROP_FAIL);
  }
  return { uri: objectUrl, blob };
}

async function cropFromBlob(
  blob: Blob,
  input: { width?: number | null; height?: number | null },
): Promise<CroppedLobbyCover> {
  if (blob.size < 32) {
    throw new Error(CROP_FAIL);
  }
  const bitmap = await bitmapFromBlob(blob);
  return rasterizeBitmap(bitmap, input);
}

async function cropLobbyCoverOnWeb(input: {
  uri: string;
  blob?: Blob | null;
  width?: number | null;
  height?: number | null;
}): Promise<CroppedLobbyCover> {
  const held = input.blob && input.blob.size > 0 ? input.blob : null;

  if (held && held.size >= 32) {
    try {
      return await cropFromBlob(held, input);
    } catch {
      // Decode failed (often HEIC). Try the painted uri, then tell them to pick JPEG/PNG.
    }
  }

  try {
    const response = await fetch(input.uri);
    if (response.ok) {
      const source = await response.blob();
      if (source.size >= 32) {
        return await cropFromBlob(source, input);
      }
    }
  } catch {
    // Safari often revokes the picker blob: URL when the sheet closes.
  }

  try {
    const bitmap = await bitmapFromUri(input.uri);
    return await rasterizeBitmap(bitmap, input);
  } catch {
    // Cached Image() frame is gone too.
  }

  if (held) {
    try {
      return await cropFromBlob(held, input);
    } catch {
      throw new Error(CROP_FAIL);
    }
  }

  throw new Error(STICK_FAIL);
}

export async function cropLobbyCover(input: {
  uri: string;
  blob?: Blob | null;
  width?: number | null;
  height?: number | null;
}): Promise<CroppedLobbyCover> {
  if (Platform.OS === 'web' || typeof ImageManipulator?.manipulate !== 'function') {
    return cropLobbyCoverOnWeb(input);
  }

  const rendered = await ImageManipulator.manipulate(input.uri).renderAsync();
  const width = Math.max(1, Math.round(rendered.width || input.width || 1));
  const height = Math.max(1, Math.round(rendered.height || input.height || 1));
  const crop = centerCropRect(width, height, LOBBY_COVER_ASPECT);
  const saved = await ImageManipulator.manipulate(input.uri)
    .crop(crop)
    .resize({ width: COVER_WIDTH })
    .renderAsync()
    .then((image) =>
      image.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.85,
      }),
    );
  if (!saved.uri) {
    throw new Error(CROP_FAIL);
  }
  return { uri: saved.uri };
}
