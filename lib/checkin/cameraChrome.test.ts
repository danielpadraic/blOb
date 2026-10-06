import { describe, expect, it } from 'vitest';

import { cameraShutterLabel, cameraStatusLine, chipRowBottom } from '@/lib/checkin/cameraChrome';

describe('check-in camera chrome', () => {
  it('uses one short line for the open slot', () => {
    expect(cameraStatusLine('Pre')).toBe('Pre selfie');
    expect(cameraStatusLine('Post')).toBe('Post selfie');
    expect(cameraStatusLine('Workout')).toBe('Workout');
  });

  it('keeps the shutter a camera button', () => {
    expect(cameraShutterLabel()).toBe('Take photo');
  });

  it('lifts the chips above the shutter', () => {
    expect(chipRowBottom(0)).toBeGreaterThan(90);
    expect(chipRowBottom(34)).toBe(132);
  });
});
