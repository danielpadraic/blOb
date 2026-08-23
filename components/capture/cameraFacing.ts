import type { CameraType } from 'expo-camera';

export type CameraFacingKind = 'social' | 'proof';

const lastByKind: Partial<Record<CameraFacingKind, CameraType>> = {};

/** Wave / Round start on the front camera. Proof / post stay rear unless this session flipped. */
export function lastCameraFacing(kind: CameraFacingKind = 'proof'): CameraType {
  const stored = lastByKind[kind];
  if (stored === 'front' || stored === 'back') {
    return stored;
  }
  return kind === 'social' ? 'front' : 'back';
}

export function rememberCameraFacing(facing: CameraType, kind: CameraFacingKind = 'proof') {
  lastByKind[kind] = facing === 'front' ? 'front' : 'back';
}
