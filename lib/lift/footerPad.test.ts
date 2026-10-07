import { describe, expect, it } from 'vitest';

import { liftLoggingClosedPad } from '@/lib/lift/footerPad';
import { TAB_BAR_HEIGHT } from '@/lib/theme';

describe('logging footer seat', () => {
  it('sits the phone row on the tab bar plus the home indicator', () => {
    expect(liftLoggingClosedPad(34, 'ios')).toBe(TAB_BAR_HEIGHT + 34);
    expect(liftLoggingClosedPad(24, 'android')).toBe(TAB_BAR_HEIGHT + 24);
    expect(liftLoggingClosedPad(0, 'ios')).toBe(TAB_BAR_HEIGHT);
  });

  it('keeps the web seat', () => {
    expect(liftLoggingClosedPad(0, 'web')).toBe(12);
    expect(liftLoggingClosedPad(20, 'web')).toBe(20);
  });

  it('drops the pad when the keyboard is up so the row sits on the keys', () => {
    expect(liftLoggingClosedPad(34, 'ios', true)).toBe(0);
    expect(liftLoggingClosedPad(0, 'web', true)).toBe(0);
    expect(liftLoggingClosedPad(24, 'android', true)).toBe(0);
  });
});
