import { describe, expect, it, vi } from 'vitest';

import {
  flashScrollIndicatorsSafe,
  scrollToEndSafe,
  scrollToOffsetSafe,
  scrollToSafe,
} from '@/lib/tourScrollSafe';

describe('scrollToSafe', () => {
  it('returns immediately when the node is null or undefined', () => {
    expect(scrollToSafe(undefined, { y: 0 })).toBe(false);
    expect(scrollToSafe(null, { y: 0 })).toBe(false);
  });

  it('skips when scrollTo is missing (Expo web host)', () => {
    expect(scrollToSafe({}, { y: 0, animated: true })).toBe(false);
  });

  it('calls scrollTo only after a null guard and typeof function check', () => {
    const scrollTo = vi.fn();
    expect(scrollToSafe({ scrollTo }, { y: 12, animated: true })).toBe(true);
    expect(scrollTo).toHaveBeenCalledWith({ y: 12, animated: true });
  });

  it('uses scrollToOffset when scrollTo is missing (FlatList)', () => {
    const scrollToOffset = vi.fn();
    expect(scrollToSafe({ scrollToOffset }, { y: 0, animated: true })).toBe(true);
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 0, animated: true });
  });

  it('does not throw if scrollTo itself throws', () => {
    expect(
      scrollToSafe(
        {
          scrollTo: () => {
            throw new TypeError('j.current?.scrollTo is not a function');
          },
        },
        { y: 0 },
      ),
    ).toBe(false);
  });
});

describe('scrollToEndSafe / scrollToOffsetSafe / flashScrollIndicatorsSafe', () => {
  it('no-ops when the method is missing', () => {
    expect(scrollToEndSafe({})).toBe(false);
    expect(scrollToOffsetSafe({}, { offset: 0, animated: false })).toBe(false);
    expect(flashScrollIndicatorsSafe({})).toBe(false);
  });

  it('calls the method when it exists', () => {
    const scrollToEnd = vi.fn();
    const scrollToOffset = vi.fn();
    const flashScrollIndicators = vi.fn();
    expect(scrollToEndSafe({ scrollToEnd }, { animated: true })).toBe(true);
    expect(scrollToOffsetSafe({ scrollToOffset }, { offset: 8, animated: false })).toBe(true);
    expect(flashScrollIndicatorsSafe({ flashScrollIndicators })).toBe(true);
    expect(scrollToEnd).toHaveBeenCalledWith({ animated: true });
    expect(scrollToOffset).toHaveBeenCalledWith({ offset: 8, animated: false });
    expect(flashScrollIndicators).toHaveBeenCalled();
  });
});
