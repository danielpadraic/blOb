import { primeCameraFromGesture } from '@/lib/cameraSession';

export type ClipAttachDraft = {
  uri: string;
  mediaType: 'image' | 'video';
  mimeType?: string | null;
  durationMs?: number | null;
  caption?: string;
};

let attachDraft: ClipAttachDraft | null = null;

export function rememberClipAttach(next: ClipAttachDraft | null) {
  attachDraft = next;
}

export function takeClipAttach(): ClipAttachDraft | null {
  const next = attachDraft;
  attachDraft = null;
  return next;
}

export function startClipRepostCapture(
  router: { push: (href: { pathname: '/capture'; params: { mode: 'story' | 'reel'; media: 'video' } }) => void },
  mode: 'wave' | 'round',
  draft: ClipAttachDraft,
) {
  rememberClipAttach(draft);
  void primeCameraFromGesture('video');
  router.push({
    pathname: '/capture',
    params: { mode: mode === 'round' ? 'reel' : 'story', media: 'video' },
  });
}
