/**
 * Front-camera tightness vs iOS Camera.
 * Stills match Photo (tighter). Video matches Video (a bit wider than Photo).
 * Rear stays 1×. Tune only these constants — no settings screen.
 */
export const FRONT_STILL_ZOOM = 1.3;
export const FRONT_STILL_ZOOM_MIN = 1.22;
export const FRONT_STILL_ZOOM_MAX = 1.4;
export const FRONT_VIDEO_ZOOM = 1.18;
export const FRONT_VIDEO_ZOOM_MIN = 1.12;
export const FRONT_VIDEO_ZOOM_MAX = 1.25;

/** Assumed device max for Expo CameraView’s 0–1 zoom (`factor = max ^ zoom`). Front iPhone formats are often high. */
export const EXPO_FRONT_ZOOM_RANGE = 64;

export type CameraFovKind = 'still' | 'video';
export type CameraFovFacing = 'front' | 'back';

export type FovCropRect = {
  originX: number;
  originY: number;
  width: number;
  height: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampFrontStillZoom(value: number): number {
  return clamp(value, FRONT_STILL_ZOOM_MIN, FRONT_STILL_ZOOM_MAX);
}

export function clampFrontVideoZoom(value: number): number {
  return clamp(value, FRONT_VIDEO_ZOOM_MIN, FRONT_VIDEO_ZOOM_MAX);
}

/** Centered digital zoom. Rear is always 1. */
export function frontFovZoom(facing: CameraFovFacing, kind: CameraFovKind): number {
  if (facing !== 'front') {
    return 1;
  }
  return kind === 'video' ? clampFrontVideoZoom(FRONT_VIDEO_ZOOM) : clampFrontStillZoom(FRONT_STILL_ZOOM);
}

/**
 * Expo CameraView `zoom` is 0–1 over the device max (iOS: `max ^ zoom`).
 * Rear is 0. Used for native video so recordAsync matches the preview.
 */
export function expoCameraZoom(facing: CameraFovFacing, kind: CameraFovKind): number {
  const fov = frontFovZoom(facing, kind);
  if (fov <= 1 || EXPO_FRONT_ZOOM_RANGE <= 1) {
    return 0;
  }
  return clamp(Math.log(fov) / Math.log(EXPO_FRONT_ZOOM_RANGE), 0, 1);
}

/** Keep aspect; crop the center so visible FOV is `1 / zoom` of the source. */
export function centeredFovCrop(width: number, height: number, zoom: number): FovCropRect {
  const safeW = Math.max(1, Math.round(width));
  const safeH = Math.max(1, Math.round(height));
  const z = Math.max(1, zoom);
  if (z <= 1.001) {
    return { originX: 0, originY: 0, width: safeW, height: safeH };
  }
  const cropW = Math.max(1, Math.min(safeW, Math.round(safeW / z)));
  const cropH = Math.max(1, Math.min(safeH, Math.round(safeH / z)));
  return {
    originX: Math.max(0, Math.round((safeW - cropW) / 2)),
    originY: Math.max(0, Math.round((safeH - cropH) / 2)),
    width: cropW,
    height: cropH,
  };
}

export function webPreviewCssTransform(input: {
  facing: CameraFovFacing;
  zoom: number;
  rotateDeg?: number;
}): string | undefined {
  const parts: string[] = [];
  if (input.rotateDeg) {
    parts.push(`rotate(${input.rotateDeg}deg)`);
  }
  if (input.facing === 'front') {
    parts.push('scaleX(-1)');
  }
  if (input.zoom > 1) {
    parts.push(`scale(${input.zoom})`);
  }
  return parts.length > 0 ? parts.join(' ') : undefined;
}

/** Ideal 4:3 still / 16:9 video. Safari may still return ultra-wide — crop after. */
export function webCameraVideoConstraints(
  facing: CameraFovFacing,
  kind: CameraFovKind,
  deviceId?: string | null,
): MediaTrackConstraints {
  const sized: MediaTrackConstraints =
    kind === 'still'
      ? {
          width: { ideal: 1440 },
          height: { ideal: 1080 },
          aspectRatio: { ideal: 4 / 3 },
        }
      : {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          aspectRatio: { ideal: 16 / 9 },
        };
  if (deviceId) {
    return { deviceId: { exact: deviceId }, ...sized };
  }
  return {
    facingMode: facing === 'front' ? 'user' : 'environment',
    ...sized,
  };
}

export function webCanvasCaptureStreamSupported(): boolean {
  return (
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  );
}
