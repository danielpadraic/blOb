import { describe, expect, it } from 'vitest';

import { previewFromStory } from '@/lib/wavePreview';

describe('video posters', () => {
  it('uses the photo itself for a photo Wave', () => {
    expect(
      previewFromStory({
        media_type: 'image',
        media_url: 'https://cdn.example/wave.jpg',
        thumbnail_url: null,
      }),
    ).toBe('https://cdn.example/wave.jpg');
  });

  it('uses the stored poster for a video Wave', () => {
    expect(
      previewFromStory({
        media_type: 'video',
        media_url: 'https://cdn.example/wave.mp4',
        thumbnail_url: 'https://cdn.example/wave-poster.jpg',
      }),
    ).toBe('https://cdn.example/wave-poster.jpg');
  });

  it('returns null for a video Wave with no poster so the tray can generate one', () => {
    expect(
      previewFromStory({
        media_type: 'video',
        media_url: 'https://cdn.example/wave.mp4',
        thumbnail_url: null,
      }),
    ).toBeNull();
  });
});
