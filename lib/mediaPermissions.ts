import { Platform } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';

import { cameraErrorKind, logCameraError, stopMedia, webCameraGrantedThisSession } from '@/lib/cameraSession';

export type MediaPermissionKind = 'camera' | 'microphone' | 'library';

export type MediaPermissionResult =
  | { ok: true }
  | { ok: false; kind: MediaPermissionKind; canAskAgain: boolean };

const COPY: Record<MediaPermissionKind, { title: string; body: string }> = {
  camera: {
    title: 'Camera is off',
    body: 'Turn it on in Settings. Gallery still works.',
  },
  microphone: {
    title: 'Microphone is off',
    body: 'Turn it on in Settings to record with sound.',
  },
  library: {
    title: 'Photo library is off',
    body: 'Turn it on in Settings to pick from your camera roll.',
  },
};

export function permissionCopy(kind: MediaPermissionKind) {
  return COPY[kind];
}

/** Web Round / Wave record needs MediaRecorder. Missing → gallery fallback. */
export function webMediaRecorderAvailable(): boolean {
  const Recorder = (globalThis as { MediaRecorder?: { new (...args: never[]): unknown } }).MediaRecorder;
  return typeof Recorder === 'function';
}

export async function cameraIsAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') {
    return Boolean(
      typeof navigator !== 'undefined' &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === 'function',
    );
  }
  try {
    return await CameraView.isAvailableAsync();
  } catch {
    return true;
  }
}

export async function queryWebCameraPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') {
    return 'prompt';
  }
  if (webCameraGrantedThisSession()) {
    return 'granted';
  }
  try {
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    if (status.state === 'granted' || status.state === 'denied') {
      return status.state;
    }
  } catch {
    // Safari and some Chromium builds reject camera PermissionName.
  }
  return 'prompt';
}

export async function ensureCameraPermission(): Promise<MediaPermissionResult> {
  if (Platform.OS === 'web') {
    if (webCameraGrantedThisSession()) {
      return { ok: true };
    }
    const queried = await queryWebCameraPermission();
    if (queried === 'granted') {
      return { ok: true };
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stopMedia({ stream });
      return { ok: true };
    } catch (error) {
      logCameraError(error, 'ensureCameraPermission');
      const kind = cameraErrorKind(error);
      return { ok: false, kind: kind === 'missing' ? 'camera' : 'camera', canAskAgain: kind !== 'denied' };
    }
  }
  const current = await Camera.getCameraPermissionsAsync();
  if (current.granted) {
    return { ok: true };
  }
  const next = await Camera.requestCameraPermissionsAsync();
  if (next.granted) {
    return { ok: true };
  }
  return { ok: false, kind: 'camera', canAskAgain: next.canAskAgain };
}

export async function ensureMicrophonePermission(): Promise<MediaPermissionResult> {
  const current = await Camera.getMicrophonePermissionsAsync();
  if (current.granted) {
    return { ok: true };
  }
  const next = await Camera.requestMicrophonePermissionsAsync();
  if (next.granted) {
    return { ok: true };
  }
  return { ok: false, kind: 'microphone', canAskAgain: next.canAskAgain };
}

export async function ensureLibraryPermission(): Promise<MediaPermissionResult> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) {
    return { ok: true };
  }
  const next = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (next.granted) {
    return { ok: true };
  }
  return { ok: false, kind: 'library', canAskAgain: next.canAskAgain };
}

/** Photo needs camera. Video needs camera + microphone (skipped on web). */
export async function ensureCapturePermissions(kind: 'photo' | 'video'): Promise<MediaPermissionResult> {
  const camera = await ensureCameraPermission();
  if (!camera.ok) {
    return camera;
  }
  if (kind === 'video' && Platform.OS !== 'web') {
    const mic = await ensureMicrophonePermission();
    if (!mic.ok) {
      return mic;
    }
  }
  return { ok: true };
}

export async function openAppSettings(): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      stopMedia({ stream });
    } catch (error) {
      logCameraError(error, 'openAppSettings');
    }
    return;
  }
  await Linking.openSettings();
}
