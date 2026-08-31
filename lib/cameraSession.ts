import { AppState, Platform } from 'react-native';

export function logCameraError(error: unknown, extra?: string) {
  const name =
    error && typeof error === 'object' && 'name' in error
      ? String((error as { name?: string }).name)
      : 'Error';
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: string }).message)
      : String(error ?? '');
  console.log('[blob:camera]', extra ?? '', name, message, error);
}

export function cameraErrorKind(error: unknown): 'denied' | 'missing' | 'other' {
  const name =
    error && typeof error === 'object' && 'name' in error
      ? String((error as { name?: string }).name)
      : '';
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: string }).message).toLowerCase()
      : String(error ?? '').toLowerCase();
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || message.includes('permission')) {
    return 'denied';
  }
  if (
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'OverconstrainedError' ||
    message.includes('not found') ||
    message.includes('no device')
  ) {
    return 'missing';
  }
  return 'other';
}

export type StoppableTrack = {
  stop: () => void;
  enabled: boolean;
};

export type StoppableStream = {
  getTracks: () => StoppableTrack[];
};

export type StoppableVideo = {
  srcObject: unknown;
  pause: () => void;
  src?: string;
  removeAttribute?: (name: string) => void;
  load?: () => void;
};

export type StoppableRecorder = {
  state?: string;
  stop: () => void;
};

export type StopMediaInput = {
  stream?: StoppableStream | null;
  video?: StoppableVideo | null;
  recorder?: StoppableRecorder | null;
};

/** Wave / Round / web preview. MediaRecorder.stop() does not clear the iPhone status-bar light. */
export function stopMedia(input: StopMediaInput = {}): void {
  const recorder = input.recorder;
  if (recorder) {
    try {
      if (recorder.state && recorder.state !== 'inactive') {
        recorder.stop();
      }
    } catch {
      // Already stopped.
    }
  }
  input.stream?.getTracks().forEach((track) => {
    try {
      track.enabled = false;
    } catch {
      // Some mocks / ended tracks reject enabled.
    }
    try {
      track.stop();
    } catch {
      // Already ended.
    }
  });
  const video = input.video;
  if (video) {
    try {
      video.pause();
    } catch {
      // Detached node.
    }
    video.srcObject = null;
    try {
      if (typeof video.removeAttribute === 'function') {
        video.removeAttribute('src');
      }
      if ('src' in video) {
        video.src = '';
      }
      video.load?.();
    } catch {
      // Camera preview nodes and mocks may have no src.
    }
  }
}

const liveStreams = new Set<StoppableStream>();
const liveVideos = new Set<StoppableVideo>();
const liveRecorders = new Set<StoppableRecorder>();
const nativeStops = new Set<() => void>();

export function watchLiveMedia(input: StopMediaInput): void {
  if (input.stream) {
    liveStreams.add(input.stream);
  }
  if (input.video) {
    liveVideos.add(input.video);
  }
  if (input.recorder) {
    liveRecorders.add(input.recorder);
  }
}

export function unwatchLiveMedia(input: StopMediaInput): void {
  if (input.stream) {
    liveStreams.delete(input.stream);
  }
  if (input.video) {
    liveVideos.delete(input.video);
  }
  if (input.recorder) {
    liveRecorders.delete(input.recorder);
  }
}

export function registerNativeCameraStop(stop: () => void): () => void {
  nativeStops.add(stop);
  return () => {
    nativeStops.delete(stop);
  };
}

export function isLiveCameraPath(pathname: string | null | undefined): boolean {
  const path = String(pathname ?? '');
  return path.includes('/capture') || path.includes('/submit');
}

let primed: MediaStream | null = null;
let webGrantedThisSession = false;
let lifecycleInstalled = false;

export function markWebCameraGranted() {
  webGrantedThisSession = true;
}

export function webCameraGrantedThisSession() {
  return webGrantedThisSession;
}

export function takePrimedCameraStream(): MediaStream | null {
  const stream = primed;
  primed = null;
  if (stream) {
    watchLiveMedia({ stream });
  }
  return stream;
}

async function getUserMediaWatched(constraints: MediaStreamConstraints): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    const error = new Error('Camera isn’t on this device.');
    error.name = 'NotFoundError';
    throw error;
  }
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  watchLiveMedia({ stream });
  return stream;
}

export async function primeCameraFromGesture(
  kind: 'photo' | 'video' = 'video',
  facing: 'front' | 'back' = 'front',
): Promise<void> {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return;
  }
  stopPrimedCameraStream();
  try {
    primed = await getUserMediaWatched({
      video: { facingMode: facing === 'front' ? 'user' : 'environment' },
      audio: kind === 'video',
    });
    const held = primed;
    setTimeout(() => {
      if (primed === held) {
        stopPrimedCameraStream();
      }
    }, 8000);
  } catch (error) {
    logCameraError(error, 'prime');
  }
}

export function stopPrimedCameraStream() {
  if (primed) {
    stopMedia({ stream: primed });
    liveStreams.delete(primed);
    primed = null;
  }
}

export function stopAllLiveMedia() {
  stopPrimedCameraStream();
  for (const stream of [...liveStreams]) {
    stopMedia({ stream });
    liveStreams.delete(stream);
  }
  for (const video of [...liveVideos]) {
    stopMedia({ video });
    liveVideos.delete(video);
  }
  for (const recorder of [...liveRecorders]) {
    stopMedia({ recorder });
    liveRecorders.delete(recorder);
  }
  for (const stop of [...nativeStops]) {
    try {
      stop();
    } catch {
      // Preview already torn down.
    }
  }
}

/** Kill leftover tracks when the user is not on Wave / Round / check-in camera. */
export function stopMediaUnlessCameraPath(pathname: string | null | undefined) {
  if (isLiveCameraPath(pathname)) {
    return;
  }
  stopAllLiveMedia();
}

export function installMediaLifecycle() {
  if (lifecycleInstalled) {
    return;
  }
  lifecycleInstalled = true;

  AppState.addEventListener('change', (state) => {
    if (state !== 'active') {
      stopAllLiveMedia();
    }
  });

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        stopAllLiveMedia();
      }
    });
    window.addEventListener('pagehide', () => {
      stopAllLiveMedia();
    });
  }
}

async function pickCameraDeviceId(facing: 'front' | 'back'): Promise<string | null> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.enumerateDevices) {
    return null;
  }
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cams = devices.filter((device) => device.kind === 'videoinput');
    const match = cams.find((device) => {
      const label = (device.label || '').toLowerCase();
      return facing === 'front'
        ? label.includes('front') || label.includes('user') || label.includes('face')
        : label.includes('back') || label.includes('rear') || label.includes('environment');
    });
    return match?.deviceId ?? null;
  } catch {
    return null;
  }
}

export async function openWebCameraStream(input: {
  facing: 'front' | 'back';
  audio: boolean;
  existing?: MediaStream | null;
}): Promise<MediaStream> {
  if (input.existing) {
    stopMedia({ stream: input.existing });
    liveStreams.delete(input.existing);
  }
  const deviceId = await pickCameraDeviceId(input.facing);
  const stream = await getUserMediaWatched({
    video: deviceId
      ? { deviceId: { exact: deviceId } }
      : { facingMode: input.facing === 'front' ? 'user' : 'environment' },
    audio: input.audio,
  });
  return stream;
}
