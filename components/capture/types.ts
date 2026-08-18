export type CaptureMode = 'story' | 'reel' | 'post';
export type CaptureMedia = 'photo' | 'video';

/** Story and Reel always record. Feed/proof stills default to photo. */
export function captureKindFor(mode: CaptureMode, media?: CaptureMedia): CaptureMedia {
  if (mode === 'story' || mode === 'reel') {
    return 'video';
  }
  return media === 'video' ? 'video' : 'photo';
}

export type CapturedMedia = {
  uri: string;
  mediaType: 'image' | 'video';
  mimeType?: string | null;
  blob?: Blob | null;
  durationMs?: number | null;
};
