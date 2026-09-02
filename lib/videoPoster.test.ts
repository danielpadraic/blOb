import { describe, expect, it } from 'vitest';

import { storedVideoPoster, videoPlaybackSrc, withStoredVideoPoster } from '@/lib/videoPosterUrl';
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

  it('stores the publish poster on the video URL and strips it for playback', () => {
    const video = 'https://cdn.example/clip.mp4';
    const poster = 'https://cdn.example/clip-poster.jpg';
    const stored = withStoredVideoPoster(video, poster);
    expect(storedVideoPoster(stored)).toBe(poster);
    expect(videoPlaybackSrc(stored)).toBe(video);
    expect(storedVideoPoster(video)).toBeNull();
  });
});
