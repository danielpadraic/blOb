import type { CameraType } from 'expo-camera';

let lastFacing: CameraType = 'back';

/** Rear camera unless this session already flipped. */
export function lastCameraFacing(): CameraType {
  return lastFacing === 'front' ? 'front' : 'back';
}

export function rememberCameraFacing(facing: CameraType) {
  lastFacing = facing === 'front' ? 'front' : 'back';
}
