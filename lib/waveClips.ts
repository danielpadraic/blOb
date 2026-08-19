export const WAVE_CLIP_MS = 15_000;

export type WaveClipWindow = {
  startMs: number;
  durationMs: number;
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
