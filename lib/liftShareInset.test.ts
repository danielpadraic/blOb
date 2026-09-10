import { describe, expect, it } from 'vitest';

import {
  liftShareFooterPad,
  liftShareKeyboardOpen,
  liftShareNameMatches,
  liftShareSheetInset,
} from '@/lib/liftShareInset';

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

describe('liftShareFooterPad', () => {
  it('drops home-indicator pad while the keyboard is up', () => {
    expect(liftShareFooterPad(true, 34)).toBe(0);
    expect(liftShareFooterPad(false, 34)).toBe(34);
  });
});

describe('liftShareNameMatches', () => {
  it('lists Courtney for “court” on display name or username', () => {
    expect(liftShareNameMatches({ display_name: 'Courtney', username: 'c_lee' }, 'court')).toBe(true);
    expect(liftShareNameMatches({ display_name: 'Lee', username: 'courtney' }, 'COURT')).toBe(true);
    expect(liftShareNameMatches({ display_name: 'Ada', username: 'ada' }, 'court')).toBe(false);
  });
});
