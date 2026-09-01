import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: () => ({ rotate: () => ({ renderAsync: async () => ({}) }) }) },
  SaveFormat: { JPEG: 'jpeg' },
}));

import {
  checkinDeviceOrientation,
  checkinPreviewRotateDeg,
  checkinStillRotateDegrees,
  checkinWebSnapRotateDegrees,
  exifOrientationToDegrees,
  readJpegExifOrientation,
} from '@/lib/checkinPhotoOrientation';

function jpegWithOrientation(orientation: number): Uint8Array {
  const exif = [
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00,
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, orientation, 0x00, 0x00, 0x00,
  ];
  const size = exif.length + 2;
  return new Uint8Array([
    0xff, 0xd8, 0xff, 0xe1, (size >> 8) & 0xff, size & 0xff, ...exif, 0xff, 0xda, 0x00, 0x08,
  ]);
}

describe('checkinDeviceOrientation', () => {
  it('uses screen.orientation and window size', () => {
    expect(checkinDeviceOrientation({ screenType: 'landscape-primary', windowWidth: 390, windowHeight: 844 })).toBe(
      'landscape',
    );
    expect(checkinDeviceOrientation({ screenType: 'portrait-primary', windowWidth: 390, windowHeight: 844 })).toBe(
      'portrait',
    );
    expect(checkinDeviceOrientation({ screenAngle: 90, windowWidth: 390, windowHeight: 844 })).toBe('landscape');
    expect(checkinDeviceOrientation({ windowWidth: 844, windowHeight: 390 })).toBe('landscape');
  });
});

describe('checkinPreviewRotateDeg', () => {
  it('rotates the live preview only when the page stays portrait', () => {
    expect(
      checkinPreviewRotateDeg({ device: 'landscape', layoutWidth: 390, layoutHeight: 720, screenAngle: 90 }),
    ).toBe(90);
    expect(
      checkinPreviewRotateDeg({ device: 'landscape', layoutWidth: 390, layoutHeight: 720, screenAngle: -90 }),
    ).toBe(-90);
    expect(
      checkinPreviewRotateDeg({ device: 'landscape', layoutWidth: 844, layoutHeight: 390, screenAngle: 90 }),
    ).toBe(0);
    expect(
      checkinPreviewRotateDeg({ device: 'portrait', layoutWidth: 390, layoutHeight: 720, screenAngle: 0 }),
    ).toBe(0);
  });
});

describe('checkinStillRotateDegrees', () => {
  it('applies EXIF on web and leaves native EXIF to the manipulator', () => {
    expect(checkinStillRotateDegrees({ platform: 'web', exifOrientation: 6 })).toBe(90);
    expect(checkinStillRotateDegrees({ platform: 'web', exifOrientation: 8, previewRotateDeg: 0 })).toBe(270);
    expect(checkinStillRotateDegrees({ platform: 'native', exifOrientation: 6 })).toBe(0);
    expect(checkinStillRotateDegrees({ platform: 'native', previewRotateDeg: 90 })).toBe(90);
    expect(checkinStillRotateDegrees({ platform: 'web', exifOrientation: 6, previewRotateDeg: 90 })).toBe(180);
  });

  it('skips preview rotate when the web snap is already landscape', () => {
    expect(checkinWebSnapRotateDegrees({ pixelWidth: 390, pixelHeight: 844, previewRotateDeg: 90 })).toBe(90);
    expect(checkinWebSnapRotateDegrees({ pixelWidth: 1920, pixelHeight: 1080, previewRotateDeg: 90 })).toBe(0);
    expect(checkinWebSnapRotateDegrees({ pixelWidth: 390, pixelHeight: 844, previewRotateDeg: 0 })).toBe(0);
  });
});

describe('readJpegExifOrientation', () => {
  it('reads Orientation 6 from a JPEG APP1 block', () => {
    expect(readJpegExifOrientation(jpegWithOrientation(6))).toBe(6);
    expect(exifOrientationToDegrees(6)).toBe(90);
    expect(readJpegExifOrientation(new Uint8Array([0x00, 0x01]))).toBeNull();
  });
});
