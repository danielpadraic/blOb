import { afterEach, describe, expect, it, vi } from 'vitest';

import { startHoldRepeat } from '@/lib/holdRepeat';

describe('hold repeat', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not tick until the delay, then accelerates, and release stops', () => {
    vi.useFakeTimers();
    const tick = vi.fn();
    const stop = startHoldRepeat(tick, { delayMs: 300, startMs: 200, minMs: 50 });
    vi.advanceTimersByTime(299);
    expect(tick).toHaveBeenCalledTimes(0);
    vi.advanceTimersByTime(1);
    expect(tick).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(200);
    expect(tick).toHaveBeenCalledTimes(2);
    stop();
    vi.advanceTimersByTime(1000);
    expect(tick).toHaveBeenCalledTimes(2);
  });
});
