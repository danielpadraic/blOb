import type { CameraType } from 'expo-camera';

export type CameraFacingKind = 'social' | 'proof' | 'checkin';

const lastByKind: Partial<Record<CameraFacingKind, CameraType>> = {};

/** Wave / Round / check-in selfie start front. Workout video / feed post stay rear unless flipped. */
export function lastCameraFacing(kind: CameraFacingKind = 'proof'): CameraType {
  const stored = lastByKind[kind];
  if (stored === 'front' || stored === 'back') {
    return stored;
  }
  return kind === 'proof' ? 'back' : 'front';
}

export function rememberCameraFacing(facing: CameraType, kind: CameraFacingKind = 'proof') {
  lastByKind[kind] = facing === 'front' ? 'front' : 'back';
}
