import { describe, expect, it } from 'vitest';

import {
  holdTabBarHidden,
  isLiveComposerKeyboardOpen,
  setLiveComposerKeyboardOpen,
  subscribeLiveComposerKeyboard,
} from '@/lib/liveComposerKeyboard';

describe('liveComposerKeyboard', () => {
  it('tells the tab bar to collapse only when Live keys are up', () => {
    setLiveComposerKeyboardOpen(false);
    const seen: boolean[] = [];
    const stop = subscribeLiveComposerKeyboard(() => seen.push(isLiveComposerKeyboardOpen()));
    setLiveComposerKeyboardOpen(true);
    setLiveComposerKeyboardOpen(true);
    setLiveComposerKeyboardOpen(false);
    stop();
    expect(seen).toEqual([true, false]);
  });

  it('keeps the bar hidden while any hold is open, even with the keys down', () => {
    setLiveComposerKeyboardOpen(false);
    const releaseA = holdTabBarHidden();
    const releaseB = holdTabBarHidden();
    expect(isLiveComposerKeyboardOpen()).toBe(true);
    releaseA();
    releaseA();
    expect(isLiveComposerKeyboardOpen()).toBe(true);
    releaseB();
    expect(isLiveComposerKeyboardOpen()).toBe(false);
  });
});
