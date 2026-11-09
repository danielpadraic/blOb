import { describe, expect, it } from 'vitest';

import { liveComposerInset, liveComposerKeyboardOpen, liveKeyboardOverlap } from '@/lib/liveComposerInset';

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

  it('pads by what the keyboard actually covers, not the raw height', () => {
    // Thread ends 70pt above the window bottom (tab bar still in flow): keys cover 336 - 70.
    const overlap = liveKeyboardOverlap({ hostBottom: 800 - 70, windowHeight: 800, keyboardFromBottom: 336 });
    expect(overlap).toBe(266);
    expect(
      liveComposerInset({ keyboardHeight: 336, closedPad: 18, measuredOverlap: overlap }),
    ).toBe(266);
    // Bar gone, thread ends at the window bottom: the full keyboard.
    expect(
      liveKeyboardOverlap({ hostBottom: 800, windowHeight: 800, keyboardFromBottom: 336 }),
    ).toBe(336);
  });

  it('never goes negative and falls back to the keyboard height before a measure', () => {
    expect(liveKeyboardOverlap({ hostBottom: 300, windowHeight: 800, keyboardFromBottom: 336 })).toBe(0);
    expect(liveKeyboardOverlap({ hostBottom: null, windowHeight: 800, keyboardFromBottom: 336 })).toBeNull();
    expect(
      liveComposerInset({ keyboardHeight: 336, closedPad: 18, measuredOverlap: null }),
    ).toBe(336);
  });

  it('adds nothing while the keys are down, even with a measure', () => {
    expect(liveComposerInset({ keyboardHeight: 0, closedPad: 18, measuredOverlap: 266 })).toBe(18);
  });
});
