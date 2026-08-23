import { primeCameraFromGesture } from '@/lib/cameraSession';
import { rememberLastCapture } from '@/lib/lastCapture';
import { STORY_CREATE_HREF } from '@/lib/routes';

type WaveCaptureRouter = {
  push: (href: typeof STORY_CREATE_HREF) => void;
};

/** Open Wave camera with no leftover draft / lastCapture (not Round, not the last share sheet). */
export function startFreshWaveCapture(router: WaveCaptureRouter) {
  rememberLastCapture(null);
  void primeCameraFromGesture('video');
  router.push(STORY_CREATE_HREF);
}
