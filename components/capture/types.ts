/** Capture query/mode ids stay `story` | `reel` | `post`. User-facing names are Wave / Round / post. */
export type CaptureMode = 'story' | 'reel' | 'post';
export type CaptureMedia = 'photo' | 'video';

/** Wave (`story`) and Round (`reel`) always record video. Feed/proof stills default to photo. */
export function captureKindFor(mode: CaptureMode, media?: CaptureMedia): CaptureMedia {
  if (mode === 'story' || mode === 'reel') {
    return 'video';
  }
  return media === 'video' ? 'video' : 'photo';
}

/** Video proofs record. Check-in, selfies, screenshots, and stills are photo. */
export function captureKindForProof(type: string): CaptureMedia {
  return type === 'video' ? 'video' : 'photo';
}

export type CapturedMedia = {
  uri: string;
  mediaType: 'image' | 'video';
  mimeType?: string | null;
  blob?: Blob | null;
  durationMs?: number | null;
};
