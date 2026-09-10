import { WAVE_CLIP_MIN_MS, WAVE_CLIP_MS, type WaveClipWindow } from '@/lib/waveClips';

export { WAVE_CLIP_MIN_MS };

/** One MediaRecorder at a time. Never two live recorders in a Wave session. */
export const WAVE_SESSION_RECORDER_COUNT = 1;

export type WaveClipGuardInput = {
  durationMs?: number | null;
  size?: number | null;
  uri?: string | null;
  chunks?: number | null;
};

export function isPlayableWaveClip(input: WaveClipGuardInput): boolean {
  if (input.size === 0 || input.chunks === 0) {
    return false;
  }
  const uri = String(input.uri ?? '').trim();
  if (!uri) {
    return false;
  }
  const duration = input.durationMs;
  if (duration != null && Number.isFinite(duration) && duration < WAVE_CLIP_MIN_MS) {
    return false;
  }
  return true;
}

export function keepPlayableWaveClips<T extends WaveClipGuardInput>(clips: T[]): T[] {
  return clips.filter((clip) => isPlayableWaveClip(clip));
}

/** Safari: do not open recorder N+1 until clip N is stored or dropped. */
export function canStartNextWaveRecorder(input: {
  liveRecorderCount: number;
  previousClipSettled: boolean;
}): boolean {
  return input.previousClipSettled && input.liveRecorderCount < WAVE_SESSION_RECORDER_COUNT;
}

/** Timeslice / stop: empty blob or < 300ms is not a Wave. */
export function assembleWaveRecorderBlob(
  chunks: Blob[],
  mimeType: string,
  durationMs: number,
): { blob: Blob; durationMs: number; mimeType: string } | null {
  const type = mimeType || 'video/webm';
  if (chunks.length === 0) {
    return null;
  }
  const blob = new Blob(chunks, { type });
  if (!isPlayableWaveClip({ size: blob.size, chunks: chunks.length, durationMs, uri: 'blob' })) {
    return null;
  }
  return { blob, durationMs, mimeType: blob.type || type };
}

export function storyClipsForPublish(input: {
  mediaType: 'image' | 'video';
  clips?: WaveClipWindow[] | null;
}): WaveClipWindow[] {
  if (input.mediaType === 'image') {
    return [
      {
        startMs: 0,
        durationMs: WAVE_CLIP_MS,
        caption: input.clips?.[0]?.caption,
        mediaUrl: input.clips?.[0]?.mediaUrl,
        thumbnailUrl: input.clips?.[0]?.thumbnailUrl,
      },
    ];
  }
  if (!input.clips?.length) {
    return [{ startMs: 0, durationMs: WAVE_CLIP_MS }];
  }
  return input.clips.filter((clip) =>
    isPlayableWaveClip({
      durationMs: clip.durationMs,
      size: clip.size,
      uri: clip.mediaUrl || 'file',
    }),
  );
}
