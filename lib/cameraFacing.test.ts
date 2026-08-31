import { describe, expect, it } from 'vitest';

import { lastCameraFacing } from '@/components/capture/cameraFacing';

describe('lastCameraFacing', () => {
  it('defaults check-in selfies to the front camera', () => {
    expect(lastCameraFacing('checkin')).toBe('front');
  });

  it('keeps workout / proof video on the rear camera', () => {
    expect(lastCameraFacing('proof')).toBe('back');
  });
});
