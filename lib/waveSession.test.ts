import { describe, expect, it } from 'vitest';

import { WAVE_CLIP_MS, waveClipWindows } from '@/lib/waveClips';
import {
  WAVE_CLIP_MIN_MS,
  WAVE_SESSION_RECORDER_COUNT,
  assembleWaveRecorderBlob,
  canStartNextWaveRecorder,
  isPlayableWaveClip,
  keepPlayableWaveClips,
  storyClipsForPublish,
} from '@/lib/waveSession';

describe('Wave session recorder lock', () => {
  it('keeps one MediaRecorder at a time', () => {
    expect(WAVE_SESSION_RECORDER_COUNT).toBe(1);
    expect(
      canStartNextWaveRecorder({ liveRecorderCount: 1, previousClipSettled: true }),
    ).toBe(false);
    expect(
      canStartNextWaveRecorder({ liveRecorderCount: 0, previousClipSettled: false }),
    ).toBe(false);
    expect(
      canStartNextWaveRecorder({ liveRecorderCount: 0, previousClipSettled: true }),
    ).toBe(true);
  });
});

describe('empty-blob guard', () => {
  it('drops size 0, no file, or duration under 300ms', () => {
    expect(WAVE_CLIP_MIN_MS).toBe(300);
    expect(isPlayableWaveClip({ uri: 'blob:1', size: 0, durationMs: 30_000 })).toBe(false);
    expect(isPlayableWaveClip({ uri: 'blob:1', chunks: 0, durationMs: 30_000 })).toBe(false);
    expect(isPlayableWaveClip({ uri: '', size: 12, durationMs: 12_000 })).toBe(false);
    expect(isPlayableWaveClip({ uri: 'blob:1', size: 12, durationMs: 299 })).toBe(false);
    expect(isPlayableWaveClip({ uri: 'blob:1', size: 12, durationMs: 301 })).toBe(true);
  });

  it('does not assemble a caption-ready blob from empty timeslices', () => {
    expect(assembleWaveRecorderBlob([], 'video/webm', 30_000)).toBeNull();
    expect(assembleWaveRecorderBlob([new Blob([])], 'video/webm', 30_000)).toBeNull();
    const tiny = new Blob([new Uint8Array([1, 2, 3])], { type: 'video/webm' });
    expect(assembleWaveRecorderBlob([tiny], 'video/webm', 200)).toBeNull();
    expect(assembleWaveRecorderBlob([tiny], 'video/webm', 12_000)?.blob.size).toBe(3);
  });

  it('drops a 30s clock overrun that is not a real second clip', () => {
    expect(waveClipWindows(30_150, 'video')).toEqual([{ startMs: 0, durationMs: WAVE_CLIP_MS }]);
    expect(
      keepPlayableWaveClips([
        { uri: 'blob:1', size: 80, durationMs: 30_000 },
        { uri: 'blob:2', size: 0, durationMs: 4_000 },
        { uri: 'blob:3', size: 12, durationMs: 200 },
      ]),
    ).toEqual([{ uri: 'blob:1', size: 80, durationMs: 30_000 }]);
  });

  it('never publishes an empty story / posts row', () => {
    expect(
      storyClipsForPublish({
        mediaType: 'video',
        clips: [
          { startMs: 0, durationMs: 30_000, mediaUrl: 'https://cdn/a' },
          { startMs: 0, durationMs: 80, mediaUrl: 'https://cdn/empty', size: 0 },
        ],
      }),
    ).toEqual([{ startMs: 0, durationMs: 30_000, mediaUrl: 'https://cdn/a' }]);
  });
});
