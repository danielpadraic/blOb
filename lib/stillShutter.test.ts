import { describe, expect, it } from 'vitest';

import {
  STILL_SHUTTER_GOT_IT,
  STILL_SHUTTER_HOLD,
  STILL_SHUTTER_HOLD_MS,
  stillShutterCopy,
  stillShutterIgnoresTap,
} from '@/lib/stillShutter';

describe('check-in still shutter busy copy', () => {
  it('keeps both lines under 28 characters', () => {
    expect(STILL_SHUTTER_GOT_IT.length).toBeLessThanOrEqual(28);
    expect(STILL_SHUTTER_HOLD.length).toBeLessThanOrEqual(28);
    expect(STILL_SHUTTER_GOT_IT).not.toMatch(/loading/i);
    expect(STILL_SHUTTER_HOLD).not.toMatch(/loading/i);
  });

  it('says Got it until 700ms, then Hold still…', () => {
    expect(stillShutterCopy(0)).toBe('Got it');
    expect(stillShutterCopy(STILL_SHUTTER_HOLD_MS - 1)).toBe('Got it');
    expect(stillShutterCopy(STILL_SHUTTER_HOLD_MS)).toBe('Hold still…');
    expect(stillShutterCopy(4_000)).toBe('Hold still…');
  });

  it('ignores a second tap while capture is in flight', () => {
    expect(stillShutterIgnoresTap(false)).toBe(false);
    expect(stillShutterIgnoresTap(true)).toBe(true);
  });
});
