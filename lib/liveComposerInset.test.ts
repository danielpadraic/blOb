import { describe, expect, it } from 'vitest';

import { liveComposerInset, liveComposerKeyboardOpen } from '@/lib/liveComposerInset';

describe('liveComposerInset', () => {
  it('uses keyboard height only when the keys are up', () => {
    expect(
      liveComposerInset({
        keyboardHeight: 336,
        closedPad: 18,
      }),
    ).toBe(336);
  });

  it('uses the closed pad (tab bar / join reserve) when the keys are down', () => {
    expect(
      liveComposerInset({
        keyboardHeight: 0,
        closedPad: 18,
      }),
    ).toBe(18);
    expect(
      liveComposerInset({
        keyboardHeight: 40,
        closedPad: 0,
      }),
    ).toBe(0);
  });

  it('does not add a second pad when the OS already resized the window', () => {
    expect(
      liveComposerInset({
        keyboardHeight: 336,
        closedPad: 88,
        layoutAlreadyAvoidsKeyboard: true,
      }),
    ).toBe(0);
  });

  it('ignores Safari chrome as a keyboard', () => {
    expect(liveComposerKeyboardOpen(80)).toBe(false);
    expect(liveComposerKeyboardOpen(336)).toBe(true);
  });
});
