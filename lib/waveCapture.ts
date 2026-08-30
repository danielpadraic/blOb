import { rememberCameraFacing } from '@/components/capture/cameraFacing';
import { primeCameraFromGesture } from '@/lib/cameraSession';
import { rememberClipAttach } from '@/lib/clipAttach';
import { rememberLastCapture } from '@/lib/lastCapture';
import { CAPTURE_REEL_HREF, STORY_CREATE_HREF } from '@/lib/routes';

type WaveCaptureRouter = {
  push: (href: typeof STORY_CREATE_HREF | typeof CAPTURE_REEL_HREF) => void;
};

/** Open Wave camera with no leftover draft / lastCapture (not Round, not the last share sheet). */
export function startFreshWaveCapture(router: WaveCaptureRouter) {
  rememberLastCapture(null);
  rememberClipAttach(null);
  rememberCameraFacing('front', 'social');
  void primeCameraFromGesture('video');
  router.push(STORY_CREATE_HREF);
}

/** Open Round camera with no leftover draft. */
export function startFreshRoundCapture(router: WaveCaptureRouter) {
  rememberLastCapture(null);
  rememberClipAttach(null);
  void primeCameraFromGesture('video');
  router.push(CAPTURE_REEL_HREF);
}
