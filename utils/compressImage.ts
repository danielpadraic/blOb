import { File as ExpoFile } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { getErrorMessage } from '@/utils/errors';

export type CompressKind = 'proof' | 'post' | 'avatar' | 'story' | 'bug';

export type CompressedImage = {
  uri: string;
  contentType: string;
  blob?: Blob | null;
};

const SMALL_SKIP_BYTES = 350 * 1024;

const PRESET: Record<CompressKind, { maxEdge: number; quality: number }> = {
  proof: { maxEdge: 1920, quality: 0.8 },
  post: { maxEdge: 1920, quality: 0.8 },
  story: { maxEdge: 1920, quality: 0.8 },
  bug: { maxEdge: 1920, quality: 0.8 },
  avatar: { maxEdge: 768, quality: 0.82 },
};

function originalResult(uri: string, contentType: string, blob?: Blob | null): CompressedImage {
  return { uri, contentType, blob };
}

function isGif(contentType: string, uri: string): boolean {
  if (contentType === 'image/gif') {
    return true;
  }
  const path = uri.toLowerCase().split('?')[0] ?? uri;
  return path.endsWith('.gif');
}

function isVideo(contentType: string): boolean {
  return contentType.startsWith('video/');
}

function isAlreadyLeanJpeg(contentType: string): boolean {
  return contentType === 'image/jpeg' || contentType === 'image/webp';
}

async function cheapFileSize(uri: string, blob?: Blob | null, size?: number | null): Promise<number | null> {
  if (typeof size === 'number' && size > 0) {
    return size;
  }
  if (blob && blob.size > 0) {
    return blob.size;
  }
  if (uri.startsWith('file:') || uri.startsWith('/')) {
    try {
      const file = new ExpoFile(uri);
      if (file.exists && typeof file.size === 'number' && file.size > 0) {
        return file.size;
      }
    } catch {
      // Size is optional; missing it just means we always encode.
    }
  }
  return null;
}

function shouldSkipSmall(input: {
  contentType: string;
  bytes: number | null;
  longEdge: number;
  maxEdge: number;
}): boolean {
  return (
    isAlreadyLeanJpeg(input.contentType) &&
    input.bytes != null &&
    input.bytes < SMALL_SKIP_BYTES &&
    input.longEdge <= input.maxEdge
  );
}

type WebCanvas = {
  width: number;
  height: number;
  getContext: (id: '2d') => {
    drawImage: (
      image: unknown,
      dx: number,
      dy: number,
      dw: number,
      dh: number,
    ) => void;
  } | null;
  toBlob: (
    callback: (blob: Blob | null) => void,
    type?: string,
    quality?: number,
  ) => void;
};

type WebBitmap = {
  width: number;
  height: number;
  close?: () => void;
};

async function fetchBlob(uri: string): Promise<Blob> {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error('Could not read image for compress.');
  }
  const blob = await response.blob();
  if (blob.size < 32) {
    throw new Error('Could not read image for compress.');
  }
  return blob;
}

async function loadWebBitmap(blob: Blob, uri: string): Promise<WebBitmap> {
  const createImageBitmap = (
    globalThis as { createImageBitmap?: (source: Blob) => Promise<WebBitmap> }
  ).createImageBitmap;
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(blob);
  }

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
    throw new Error('No web image decoder.');
  }

  const objectUrl = (
    globalThis as { URL?: { createObjectURL?: (next: Blob) => string } }
  ).URL?.createObjectURL?.(blob);
  const src =
    uri.startsWith('blob:') || uri.startsWith('data:') || uri.startsWith('http')
      ? uri
      : objectUrl;
  if (!src) {
    throw new Error('No web image source.');
  }

  const image = new ImageCtor();
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Could not decode image.'));
    image.src = src;
    void image.decode?.().then(() => resolve()).catch(() => undefined);
  });
  return image;
}

async function compressOnWeb(input: {
  uri: string;
  contentType: string;
  blob?: Blob | null;
  bytes: number | null;
  maxEdge: number;
  quality: number;
}): Promise<CompressedImage> {
  const doc = (globalThis as { document?: { createElement?: (tag: string) => unknown } }).document;
  if (!doc?.createElement) {
    throw new Error('No canvas.');
  }

  const source = input.blob && input.blob.size > 0 ? input.blob : await fetchBlob(input.uri);
  const bitmap = await loadWebBitmap(source, input.uri);
  const longEdge = Math.max(bitmap.width, bitmap.height);
  if (
    shouldSkipSmall({
      contentType: input.contentType,
      bytes: input.bytes ?? source.size,
      longEdge,
      maxEdge: input.maxEdge,
    })
  ) {
    bitmap.close?.();
    return originalResult(input.uri, input.contentType, input.blob);
  }

  const scale = longEdge > input.maxEdge ? input.maxEdge / longEdge : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = doc.createElement('canvas') as WebCanvas;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    throw new Error('No 2d canvas.');
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const out = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (next) => (next && next.size > 32 ? resolve(next) : reject(new Error('toBlob failed'))),
      'image/jpeg',
      input.quality,
    );
  });

  const objectUrl = (
    globalThis as { URL?: { createObjectURL?: (blob: Blob) => string } }
  ).URL?.createObjectURL?.(out);

  return {
    uri: objectUrl ?? input.uri,
    contentType: 'image/jpeg',
    blob: out,
  };
}

async function compressOnNative(input: {
  uri: string;
  contentType: string;
  blob?: Blob | null;
  bytes: number | null;
  maxEdge: number;
  quality: number;
}): Promise<CompressedImage> {
  const image = await ImageManipulator.manipulate(input.uri).renderAsync();
  const longEdge = Math.max(image.width, image.height);
  if (
    shouldSkipSmall({
      contentType: input.contentType,
      bytes: input.bytes,
      longEdge,
      maxEdge: input.maxEdge,
    })
  ) {
    return originalResult(input.uri, input.contentType, input.blob);
  }

  const rendered =
    longEdge > input.maxEdge
      ? await ImageManipulator.manipulate(input.uri)
          .resize(image.width >= image.height ? { width: input.maxEdge } : { height: input.maxEdge })
          .renderAsync()
      : image;

  const saved = await rendered.saveAsync({
    format: SaveFormat.JPEG,
    compress: input.quality,
  });
  if (!saved.uri) {
    throw new Error('Manipulator returned no uri.');
  }
  return { uri: saved.uri, contentType: 'image/jpeg', blob: null };
}

/** Resize + JPEG-encode stills. Never throws — caller uploads the original on failure. */
export async function compressImageForUpload(input: {
  uri: string;
  mimeType?: string | null;
  kind: CompressKind;
  blob?: Blob | null;
  size?: number | null;
}): Promise<CompressedImage> {
  const contentType = (input.mimeType ?? '').toLowerCase() || 'image/jpeg';
  if (isGif(contentType, input.uri) || isVideo(contentType) || !contentType.startsWith('image/')) {
    return originalResult(input.uri, contentType, input.blob);
  }

  const preset = PRESET[input.kind];
  try {
    const bytes = await cheapFileSize(input.uri, input.blob, input.size);
    if (Platform.OS === 'web') {
      return await compressOnWeb({
        uri: input.uri,
        contentType,
        blob: input.blob,
        bytes,
        maxEdge: preset.maxEdge,
        quality: preset.quality,
      });
    }
    return await compressOnNative({
      uri: input.uri,
      contentType,
      blob: input.blob,
      bytes,
      maxEdge: preset.maxEdge,
      quality: preset.quality,
    });
  } catch (error) {
    console.log('[blob:compress] failed, using original', input.kind, getErrorMessage(error));
    return originalResult(input.uri, contentType, input.blob);
  }
}
