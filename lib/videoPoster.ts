import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Platform } from 'react-native';

import { uploadPostMedia } from '@/utils/upload';
import { previewFromStory } from '@/lib/wavePreview';
import { storedVideoPoster, videoPlaybackSrc } from '@/lib/videoPosterUrl';

export { previewFromStory };
export { storedVideoPoster, videoPlaybackSrc, withStoredVideoPoster } from '@/lib/videoPosterUrl';

const POSTER_TIME_SEC = 0.2;
const cache = new Map<string, string>();
const persistOnce = new Set<string>();

export function cachedPosterUri(videoUrl: string | null | undefined): string | null {
  const key = videoPlaybackSrc(videoUrl) || videoUrl?.trim();
  if (!key) {
    return null;
  }
  return cache.get(key) ?? storedVideoPoster(videoUrl);
}

export async function posterUriFor(videoUrl: string | null | undefined): Promise<string | null> {
  const stored = storedVideoPoster(videoUrl);
  if (stored) {
    return stored;
  }
  const key = videoPlaybackSrc(videoUrl);
  if (!key) {
    return null;
  }
  const hit = cache.get(key);
  if (hit) {
    return hit;
  }
  const generated = Platform.OS === 'web' ? await posterFromWebVideo(key) : await posterFromNativeVideo(key);
  if (generated) {
    cache.set(key, generated);
  }
  return generated;
}

export async function uploadPosterFromVideo(input: {
  videoUri: string;
  userId: string;
  fileStem: string;
}): Promise<string | null> {
  const local = await posterUriFor(input.videoUri);
  if (!local) {
    return null;
  }
  try {
    return await uploadPostMedia({
      uri: local,
      userId: input.userId,
      fileStem: input.fileStem,
      mimeType: 'image/jpeg',
    });
  } catch {
    return null;
  }
}

export async function persistGeneratedPoster(input: {
  id: string;
  videoUrl: string;
  localUri: string;
  userId: string;
  kind: 'story' | 'reel';
}): Promise<string | null> {
  if (!input.id || persistOnce.has(input.id) || input.id.startsWith('optimistic-')) {
    return null;
  }
  persistOnce.add(input.id);
  try {
    const publicUrl = await uploadPostMedia({
      uri: input.localUri,
      userId: input.userId,
      fileStem: `${input.kind === 'reel' ? 'reels' : 'stories'}/${Date.now()}-poster`,
      mimeType: 'image/jpeg',
    });
    cache.set(videoPlaybackSrc(input.videoUrl) || input.videoUrl, publicUrl);
    return publicUrl;
  } catch {
    persistOnce.delete(input.id);
    return null;
  }
}

async function posterFromNativeVideo(uri: string): Promise<string | null> {
  try {
    const { createVideoPlayer } = require('expo-video') as {
      createVideoPlayer?: (source: string) => {
        generateThumbnailsAsync?: (times: number[]) => Promise<unknown[]>;
        replaceAsync?: (source: string) => Promise<void>;
        release?: () => void;
      };
    };
    if (typeof createVideoPlayer !== 'function') {
      return null;
    }
    const player = createVideoPlayer(uri);
    try {
      if (typeof player.replaceAsync === 'function') {
        await player.replaceAsync(uri);
      }
      if (typeof player.generateThumbnailsAsync !== 'function') {
        return null;
      }
      const thumbs = await player.generateThumbnailsAsync([POSTER_TIME_SEC]);
      const first = thumbs?.[0];
      if (!first) {
        return null;
      }
      const rendered = await ImageManipulator.manipulate(first as never).renderAsync();
      const saved = await rendered.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.72,
      });
      return saved.uri || null;
    } finally {
      player.release?.();
    }
  } catch {
    return null;
  }
}

async function posterFromWebVideo(url: string): Promise<string | null> {
  if (typeof document === 'undefined') {
    return null;
  }
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.muted = true;
    video.playsInline = true;
    video.preload = 'metadata';
    video.crossOrigin = 'anonymous';
    let settled = false;
    const finish = (value: string | null) => {
      if (settled) {
        return;
      }
      settled = true;
      video.removeAttribute('src');
      video.load();
      resolve(value);
    };
    video.onloadeddata = () => {
      try {
        const mark = Number.isFinite(video.duration) && video.duration > 0
          ? Math.min(POSTER_TIME_SEC, video.duration * 0.1)
          : POSTER_TIME_SEC;
        video.currentTime = mark;
      } catch {
        finish(null);
      }
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, video.videoWidth || 320);
        canvas.height = Math.max(1, video.videoHeight || 180);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        finish(canvas.toDataURL('image/jpeg', 0.72));
      } catch {
        finish(null);
      }
    };
    video.onerror = () => finish(null);
    window.setTimeout(() => finish(null), 4000);
    video.src = url;
  });
}
