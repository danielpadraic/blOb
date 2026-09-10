import { describe, expect, it } from 'vitest';

import {
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
});
