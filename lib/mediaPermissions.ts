import { Platform } from 'react-native';
import { Camera, CameraView } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';

export type MediaPermissionKind = 'camera' | 'microphone' | 'library';

export type MediaPermissionResult =
  | { ok: true }
  | { ok: false; kind: MediaPermissionKind; canAskAgain: boolean };

const COPY: Record<MediaPermissionKind, { title: string; body: string }> = {
  camera: {
    title: 'Camera access needed',
    body: 'Take a check-in photo or Story for your Challenge. Turn camera on in Settings, then come back.',
  },
  microphone: {
    title: 'Microphone access needed',
    body: 'Record a short Story or Reel with sound. Turn microphone on in Settings, then come back.',
  },
  library: {
    title: 'Photo access needed',
    body: 'Choose a photo or clip from your library for Stories, Reels, and Challenge check-ins. Turn it on in Settings.',
  },
};

export function permissionCopy(kind: MediaPermissionKind) {
  return COPY[kind];
}

export async function cameraIsAvailable(): Promise<boolean> {
  try {
    return await CameraView.isAvailableAsync();
  } catch {
    return Platform.OS !== 'web';
  }
}

export async function ensureCameraPermission(): Promise<MediaPermissionResult> {
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
    return;
  }
  await Linking.openSettings();
}
