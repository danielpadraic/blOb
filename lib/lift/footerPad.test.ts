import { describe, expect, it } from 'vitest';

import { LIFT_FOOTER_SEAT_GAP, liftLoggingClosedPad } from '@/lib/lift/footerPad';

describe('liftLoggingClosedPad', () => {
  it('rests on the tab bar without re-adding its height or the home indicator', () => {
    expect(liftLoggingClosedPad(34, true)).toBe(LIFT_FOOTER_SEAT_GAP);
    expect(liftLoggingClosedPad(0, true)).toBe(LIFT_FOOTER_SEAT_GAP);
  });

  it('is the same seat on iOS, Android, and narrow Web', () => {
    expect(liftLoggingClosedPad(24, true)).toBe(liftLoggingClosedPad(0, true));
  });

  it('keeps a home-indicator pad when no bar is shown', () => {
    expect(liftLoggingClosedPad(0, false)).toBe(12);
    expect(liftLoggingClosedPad(34, false)).toBe(34);
  });

  it('sits on the keys with no pad when the keyboard is up', () => {
    expect(liftLoggingClosedPad(34, true, true)).toBe(0);
    expect(liftLoggingClosedPad(34, false, true)).toBe(0);
  });
});
