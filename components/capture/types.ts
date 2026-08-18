export type CaptureMode = 'story' | 'reel' | 'post';

export type CapturedMedia = {
  uri: string;
  mediaType: 'image' | 'video';
  mimeType?: string | null;
  blob?: Blob | null;
  durationMs?: number | null;
};
