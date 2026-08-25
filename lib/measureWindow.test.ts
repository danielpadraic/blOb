import { describe, expect, it, vi } from 'vitest';

import { measureInWindowSafe } from '@/lib/measureWindow';

describe('measureInWindowSafe', () => {
  it('returns immediately when the node is null or undefined', () => {
    const onMeasure = vi.fn();
    expect(measureInWindowSafe(undefined, onMeasure)).toBe(false);
    expect(measureInWindowSafe(null, onMeasure)).toBe(false);
    expect(onMeasure).not.toHaveBeenCalled();
  });

  it('skips register when measureInWindow is missing (Expo web host)', () => {
    const onMeasure = vi.fn();
    expect(measureInWindowSafe({}, onMeasure)).toBe(false);
    expect(onMeasure).not.toHaveBeenCalled();
  });

  it('measures only after a null guard and typeof function check', () => {
    const onMeasure = vi.fn();
    const node = {
      measureInWindow: (cb: (x: number, y: number, width: number, height: number) => void) => {
        cb(1, 2, 3, 4);
      },
    };
    expect(measureInWindowSafe(node, onMeasure)).toBe(true);
    expect(onMeasure).toHaveBeenCalledWith({ x: 1, y: 2, width: 3, height: 4 });
  });

  it('does not throw if measureInWindow itself throws', () => {
    const onMeasure = vi.fn();
    expect(
      measureInWindowSafe(
        {
          measureInWindow: () => {
            throw new TypeError("Cannot read properties of undefined (reading 'getBoundingClientRect')");
          },
        },
        onMeasure,
      ),
    ).toBe(false);
    expect(onMeasure).not.toHaveBeenCalled();
  });
});
