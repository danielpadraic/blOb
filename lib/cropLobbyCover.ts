import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { LOBBY_COVER_ASPECT, centerCropRect } from '@/lib/lobbyCover';

export type CroppedLobbyCover = {
  uri: string;
  blob?: Blob | null;
};

const COVER_WIDTH = 1080;

type BitmapLike = {
  width: number;
  height: number;
  close?: () => void;
};

async function cropLobbyCoverOnWeb(input: {
  uri: string;
  width?: number | null;
  height?: number | null;
}): Promise<CroppedLobbyCover> {
  const response = await fetch(input.uri);
  if (!response.ok) {
    throw new Error('Couldn’t crop that photo.');
  }
  const source = await response.blob();
  if (source.size < 32) {
    throw new Error('Couldn’t crop that photo.');
  }

  const createImageBitmap = (
    globalThis as { createImageBitmap?: (next: Blob) => Promise<BitmapLike> }
  ).createImageBitmap;
  let bitmap: BitmapLike;
  if (typeof createImageBitmap === 'function') {
    bitmap = await createImageBitmap(source);
  } else {
    throw new Error('Couldn’t crop that photo.');
  }

  const width = Math.max(1, Math.round(bitmap.width || input.width || 1));
  const height = Math.max(1, Math.round(bitmap.height || input.height || 1));
  const crop = centerCropRect(width, height, LOBBY_COVER_ASPECT);
  const scale = COVER_WIDTH / crop.width;
  const outW = COVER_WIDTH;
  const outH = Math.max(1, Math.round(crop.height * scale));

  const doc = (globalThis as { document?: { createElement?: (tag: string) => unknown } }).document;
  const canvas = doc?.createElement?.('canvas') as
    | {
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
      }
    | undefined;
  if (!canvas) {
    bitmap.close?.();
    throw new Error('Couldn’t crop that photo.');
  }
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    throw new Error('Couldn’t crop that photo.');
  }
  ctx.drawImage(bitmap, crop.originX, crop.originY, crop.width, crop.height, 0, 0, outW, outH);
  bitmap.close?.();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (next) => (next && next.size > 32 ? resolve(next) : reject(new Error('Couldn’t crop that photo.'))),
      'image/jpeg',
      0.85,
    );
  });
  const objectUrl = (
    globalThis as { URL?: { createObjectURL?: (next: Blob) => string } }
  ).URL?.createObjectURL?.(blob);
  if (!objectUrl) {
    throw new Error('Couldn’t crop that photo.');
  }
  return { uri: objectUrl, blob };
}

export async function cropLobbyCover(input: {
  uri: string;
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
    throw new Error('Couldn’t crop that photo.');
  }
  return { uri: saved.uri };
}
