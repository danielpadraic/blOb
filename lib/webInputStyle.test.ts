import { describe, expect, it } from 'vitest';

import { flattenWebInputStyle, webInputStyleKeysAreSafe } from '@/lib/webInputStyle';

function assignOntoDomStyle(style: Record<string, unknown>) {
  const elementStyle: Record<string, unknown> = {};
  Object.defineProperty(elementStyle, '0', {
    set() {
      throw new TypeError('Cannot set indexed properties on this object');
    },
  });
  Object.defineProperty(elementStyle, '1', {
    set() {
      throw new TypeError('Cannot set indexed properties on this object');
    },
  });
  Object.defineProperty(elementStyle, 'length', {
    set() {
      throw new TypeError('Cannot set indexed properties on this object');
    },
    get() {
      return 0;
    },
  });
  for (const [key, value] of Object.entries(style)) {
    elementStyle[key] = value;
  }
  return elementStyle;
}

describe('flattenWebInputStyle', () => {
  it('flattens nested Input boxStyle arrays without numeric keys', () => {
    const box = [
      { minHeight: 52, maxHeight: 220, textAlignVertical: 'top' },
      { overflowY: 'auto', fieldSizing: 'content', resize: 'none' },
      [
        {
          minHeight: 52,
          paddingHorizontal: 16,
          paddingVertical: 14,
          fontSize: 16,
          color: '#151716',
          backgroundColor: '#FFFFFF',
          borderWidth: 1,
          borderColor: '#E8EBE8',
          borderRadius: 12,
        },
        undefined,
      ],
    ];

    const broken = Object.assign(
      {},
      ...box.filter((item): item is object => Boolean(item) && typeof item === 'object'),
    ) as Record<string, unknown>;
    expect(Object.keys(broken)).toEqual(expect.arrayContaining(['0', '1']));

    const flat = flattenWebInputStyle(box);
    expect(webInputStyleKeysAreSafe(flat)).toBe(true);
    expect(Object.keys(flat).some((key) => key === '0' || key === '1' || key === 'length')).toBe(false);
    expect(flat.minHeight).toBe(52);
    expect(flat.maxHeight).toBe(220);
    expect(flat.paddingLeft).toBe(16);
    expect(flat.paddingRight).toBe(16);
    expect(flat.paddingTop).toBe(14);
    expect(flat.overflowY).toBe('auto');
    expect(flat.fieldSizing).toBe('content');
    expect(flat.color).toBe('#151716');
    expect(flat.textAlignVertical).toBeUndefined();
    expect(() => assignOntoDomStyle(flat)).not.toThrow();
  });
});
