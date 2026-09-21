import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-image-manipulator', () => ({
  ImageManipulator: {},
  SaveFormat: { JPEG: 'jpeg' },
}));

import { cropLobbyCover } from '@/lib/cropLobbyCover';

function jpegBlob(): Blob {
  return new Blob([new Uint8Array(64).fill(7)], { type: 'image/jpeg' });
}

function installWebCrop() {
  const bitmap = { width: 1700, height: 2000, close: vi.fn() };
  const createImageBitmap = vi.fn(async () => bitmap);
  const toBlob = vi.fn((cb: (blob: Blob | null) => void) => cb(jpegBlob()));
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: vi.fn(),
    }),
    toBlob,
  };
  vi.stubGlobal('createImageBitmap', createImageBitmap);
  vi.stubGlobal('document', {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return canvas;
      }
      return {};
    },
  });
  vi.stubGlobal('fetch', vi.fn(async () => {
    throw new TypeError('Failed to fetch');
  }));
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:https://blob.mobi/cropped'),
  });
  return { createImageBitmap, fetch: globalThis.fetch as ReturnType<typeof vi.fn> };
}

describe('cropLobbyCover on web', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('crops from the held File and never fetches a dead blob: URL', async () => {
    const { createImageBitmap, fetch } = installWebCrop();
    const file = jpegBlob();
    const cropped = await cropLobbyCover({
      uri: 'blob:https://blob.mobi/revoked',
      blob: file,
      width: 1700,
      height: 2000,
    });
    expect(fetch).not.toHaveBeenCalled();
    expect(createImageBitmap).toHaveBeenCalledWith(file);
    expect(cropped.blob).toBeTruthy();
    expect(cropped.blob?.type).toBe('image/jpeg');
    expect(cropped.uri.startsWith('blob:')).toBe(true);
  });

  it('says the photo did not stick when the blob: URL is dead and nothing is held', async () => {
    installWebCrop();
    await expect(
      cropLobbyCover({ uri: 'blob:https://blob.mobi/revoked', width: 100, height: 100 }),
    ).rejects.toThrow('That photo didn’t stick. Pick it again.');
  });
});
