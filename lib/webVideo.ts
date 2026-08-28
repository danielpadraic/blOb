/** Web <video> lock so iOS Safari never shows native skip-10 / AirPlay chrome. */

export const WEB_VIDEO_CONTROLS_LIST = 'nodownload nofullscreen noremoteplayback noplaybackrate';

export const WEB_VIDEO_LOCK = {
  playsInline: true,
  controls: false,
  disablePictureInPicture: true,
  disableRemotePlayback: true,
  controlsList: WEB_VIDEO_CONTROLS_LIST,
  'webkit-playsinline': 'true',
  'x-webkit-airplay': 'deny',
} as const;

type WebkitVideo = HTMLVideoElement & {
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
};

export function applyWebVideoLock(node: HTMLVideoElement | null, poster?: string | null): void {
  if (!node) {
    return;
  }
  const video = node as WebkitVideo;
  video.playsInline = true;
  video.setAttribute('playsinline', '');
  video.setAttribute('webkit-playsinline', 'true');
  video.controls = false;
  video.removeAttribute('controls');
  video.disablePictureInPicture = true;
  video.disableRemotePlayback = true;
  video.setAttribute('controlslist', WEB_VIDEO_CONTROLS_LIST);
  video.setAttribute('x-webkit-airplay', 'deny');
  if (poster) {
    video.poster = poster;
  }
}

export function preventWebVideoFullscreen(event: Event): void {
  event.preventDefault();
  const video = event.currentTarget as WebkitVideo | null;
  try {
    video?.webkitExitFullscreen?.();
  } catch {
    // Safari may throw if it never entered fullscreen.
  }
}
