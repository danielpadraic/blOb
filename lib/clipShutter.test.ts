import { describe, expect, it } from 'vitest';

import {
  clipShutterIdleLabel,
  clipShutterLabel,
  clipShutterReleaseStopsRecording,
} from '@/lib/clipShutter';

describe('clip shutter', () => {
  it('uses tap-to-record copy, not hold', () => {
    expect(clipShutterIdleLabel('wave')).toBe('Tap to wave · 30s');
    expect(clipShutterIdleLabel('round')).toBe('Tap to record · 3:00');
    expect(clipShutterLabel('wave', true)).toBe('Tap to stop');
    expect(clipShutterLabel('round', false)).toBe('Tap to record · 3:00');
    expect(clipShutterIdleLabel('wave')).not.toMatch(/hold/i);
    expect(clipShutterIdleLabel('round')).not.toMatch(/hold/i);
  });

  it('does not stop recording on press-out', () => {
    expect(clipShutterReleaseStopsRecording()).toBe(false);
  });
});
