import { describe, expect, it } from 'vitest';

import {
  FRONT_STILL_ZOOM,
  FRONT_VIDEO_ZOOM,
  centeredFovCrop,
  clampFrontStillZoom,
  clampFrontVideoZoom,
  expoCameraZoom,
  frontFovZoom,
  webCameraVideoConstraints,
  webPreviewCssTransform,
} from '@/lib/cameraFov';

describe('frontFovZoom', () => {
  it('tightens front stills more than front video, and leaves rear at 1', () => {
    expect(frontFovZoom('front', 'still')).toBe(FRONT_STILL_ZOOM);
    expect(frontFovZoom('front', 'video')).toBe(FRONT_VIDEO_ZOOM);
    expect(frontFovZoom('front', 'still')).toBeGreaterThan(frontFovZoom('front', 'video'));
    expect(frontFovZoom('back', 'still')).toBe(1);
    expect(frontFovZoom('back', 'video')).toBe(1);
  });

  it('clamps stills and video to the Photo / Video bands', () => {
    expect(clampFrontStillZoom(1)).toBe(1.22);
    expect(clampFrontStillZoom(2)).toBe(1.4);
    expect(clampFrontVideoZoom(1)).toBe(1.12);
    expect(clampFrontVideoZoom(2)).toBe(1.25);
  });
});

describe('centeredFovCrop', () => {
  it('keeps aspect and crops the center at 1.30×', () => {
    const crop = centeredFovCrop(1300, 1000, 1.3);
    expect(crop.width).toBe(1000);
    expect(crop.height).toBe(769);
    expect(crop.originX).toBe(150);
    expect(crop.originY).toBe(116);
    expect(crop.width / crop.height).toBeCloseTo(1300 / 1000, 2);
  });

  it('does not crop at 1×', () => {
    expect(centeredFovCrop(1920, 1080, 1)).toEqual({
      originX: 0,
      originY: 0,
      width: 1920,
      height: 1080,
    });
  });
});

describe('expoCameraZoom', () => {
  it('is 0 on rear and a small 0–1 value on front', () => {
    expect(expoCameraZoom('back', 'still')).toBe(0);
    expect(expoCameraZoom('back', 'video')).toBe(0);
    expect(expoCameraZoom('front', 'still')).toBeGreaterThan(expoCameraZoom('front', 'video'));
    expect(expoCameraZoom('front', 'still')).toBeGreaterThan(0);
    expect(expoCameraZoom('front', 'still')).toBeLessThan(1);
  });
});

describe('webPreviewCssTransform', () => {
  it('mirrors front preview and scales FOV without stretching', () => {
    expect(webPreviewCssTransform({ facing: 'front', zoom: 1.3 })).toBe('scaleX(-1) scale(1.3)');
    expect(webPreviewCssTransform({ facing: 'back', zoom: 1 })).toBeUndefined();
    expect(webPreviewCssTransform({ facing: 'front', zoom: 1.18, rotateDeg: 90 })).toBe(
      'rotate(90deg) scaleX(-1) scale(1.18)',
    );
  });
});

describe('webCameraVideoConstraints', () => {
  it('asks for 4:3 stills and 16:9 video', () => {
    const still = webCameraVideoConstraints('front', 'still');
    const video = webCameraVideoConstraints('back', 'video', 'cam-1');
    expect(still.facingMode).toBe('user');
    expect(still.aspectRatio).toEqual({ ideal: 4 / 3 });
    expect(video.deviceId).toEqual({ exact: 'cam-1' });
    expect(video.aspectRatio).toEqual({ ideal: 16 / 9 });
  });
});
