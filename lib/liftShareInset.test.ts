import { describe, expect, it } from 'vitest';

import { liftShareKeyboardOpen, liftShareSheetInset } from '@/lib/liftShareInset';

describe('liftShareSheetInset', () => {
  it('uses keyboardHeight when the keyboard is up — not tabBarLift + 88', () => {
    expect(liftShareSheetInset(336, 34)).toBe(336);
    expect(liftShareSheetInset(280, 0)).toBe(280);
  });

  it('uses the sheet safe pad when the keyboard is down', () => {
    expect(liftShareSheetInset(0, 34)).toBe(34);
    expect(liftShareSheetInset(0, 12)).toBe(12);
  });
});

describe('liftShareKeyboardOpen', () => {
  it('is true only when height is above 0', () => {
    expect(liftShareKeyboardOpen(0)).toBe(false);
    expect(liftShareKeyboardOpen(336)).toBe(true);
  });
});
