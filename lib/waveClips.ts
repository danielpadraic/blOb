/** Playback / published Wave segment length. */
export const WAVE_CLIP_MS = 15_000;

/**
 * Continuous Wave record cap (camera + web MediaRecorder).
 * Publish still splits on WAVE_CLIP_MS. Do not use this as playback length.
 */
export const WAVE_RECORD_MAX_SEC = 90;

export type WaveClipWindow = {
  startMs: number;
  durationMs: number;
  caption?: string | null;
};

/** ImagePicker duration is usually ms; values under 1000 are treated as seconds. */
export function mediaDurationMs(duration?: number | null): number | null {
  if (duration == null || !Number.isFinite(duration) || duration <= 0) {
    return null;
  }
  if (duration < 1000) {
    return Math.round(duration * 1000);
  }
  return Math.round(duration);
}

export function waveClipWindows(durationMs: number | null | undefined, mediaType: 'image' | 'video'): WaveClipWindow[] {
  if (mediaType === 'image') {
    return [{ startMs: 0, durationMs: WAVE_CLIP_MS }];
  }
  const total = Math.max(mediaDurationMs(durationMs) ?? WAVE_CLIP_MS, 1);
  if (total <= WAVE_CLIP_MS) {
    return [{ startMs: 0, durationMs: total }];
  }
  const clips: WaveClipWindow[] = [];
  let start = 0;
  while (start < total) {
    const length = Math.min(WAVE_CLIP_MS, total - start);
    clips.push({ startMs: start, durationMs: length });
    start += length;
  }
  return clips;
}

export function formatWaveClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatWaveClipLabel(index: number, clip: WaveClipWindow): string {
  return `Clip ${index + 1} · ${formatWaveClock(clip.startMs)}–${formatWaveClock(clip.startMs + clip.durationMs)}`;
}

/** Prefer picker duration; if missing, read metadata from the file (web). */
export async function resolveMediaDurationMs(
  uri: string,
  duration?: number | null,
): Promise<number | null> {
  const known = mediaDurationMs(duration);
  if (known) {
    return known;
  }
  if (typeof document === 'undefined' || !uri) {
    return null;
  }
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    const finish = (value: number | null) => {
      video.removeAttribute('src');
      video.load();
      resolve(value);
    };
    video.onloadedmetadata = () => {
      const seconds = video.duration;
      finish(Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds * 1000) : null);
    };
    video.onerror = () => finish(null);
    video.src = uri;
  });
}
