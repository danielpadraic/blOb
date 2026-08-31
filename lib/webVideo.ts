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

const WEB_VIDEO_HIDE_CONTROLS_CSS =
  'video::-webkit-media-controls,video::-webkit-media-controls-enclosure,video::-webkit-media-controls-start-playback-button,video::-webkit-media-controls-panel{display:none!important;-webkit-appearance:none!important}';

let webkitControlsHidden = false;

export function hideWebkitVideoControls(): void {
  if (webkitControlsHidden || typeof document === 'undefined') {
    return;
  }
  webkitControlsHidden = true;
  const style = document.createElement('style');
  style.setAttribute('data-blob-video-lock', '1');
  style.textContent = WEB_VIDEO_HIDE_CONTROLS_CSS;
  document.head.appendChild(style);
}

export function applyWebVideoLock(node: HTMLVideoElement | null, poster?: string | null): void {
  hideWebkitVideoControls();
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
