import { Platform } from 'react-native';

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

let primed: MediaStream | null = null;

export function takePrimedCameraStream(): MediaStream | null {
  const stream = primed;
  primed = null;
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
    primed = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: facing === 'front' ? 'user' : 'environment' },
      audio: kind === 'video',
    });
  } catch (error) {
    logCameraError(error, 'prime');
  }
}

export function stopPrimedCameraStream() {
  primed?.getTracks().forEach((track) => track.stop());
  primed = null;
}

export async function openWebCameraStream(input: {
  facing: 'front' | 'back';
  audio: boolean;
  existing?: MediaStream | null;
}): Promise<MediaStream> {
  if (input.existing && input.existing.getVideoTracks().some((track) => track.readyState === 'live')) {
    return input.existing;
  }
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    const error = new Error('Camera isn’t on this device.');
    error.name = 'NotFoundError';
    throw error;
  }
  return navigator.mediaDevices.getUserMedia({
    video: { facingMode: input.facing === 'front' ? 'user' : 'environment' },
    audio: input.audio,
  });
}
