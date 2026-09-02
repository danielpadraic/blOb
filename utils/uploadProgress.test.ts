import { describe, expect, it } from 'vitest';

import { compressImageForUpload } from '@/utils/compressImage';
import { uploadProgressPercent } from '@/utils/upload';

describe('uploadProgressPercent', () => {
  it('returns a 0–100 percent when byte totals are known', () => {
    expect(uploadProgressPercent(50, 100)).toBe(50);
    expect(uploadProgressPercent(0, 10)).toBe(0);
    expect(uploadProgressPercent(11, 10)).toBe(100);
  });

  it('returns null when the client cannot read bytes', () => {
    expect(uploadProgressPercent(10, 0)).toBeNull();
    expect(uploadProgressPercent(Number.NaN, 100)).toBeNull();
  });
});

describe('compressImageForUpload', () => {
  it('skips video and still compresses image mime types by attempting encode', async () => {
    const video = await compressImageForUpload({
      uri: 'https://cdn.example/clip.mp4',
      mimeType: 'video/mp4',
      kind: 'post',
    });
    expect(video.uri).toBe('https://cdn.example/clip.mp4');
    expect(video.contentType).toBe('video/mp4');

    const gif = await compressImageForUpload({
      uri: 'https://cdn.example/loop.gif',
      mimeType: 'image/gif',
      kind: 'post',
    });
    expect(gif.contentType).toBe('image/gif');
  });
});
