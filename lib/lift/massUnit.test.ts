import { describe, expect, it } from 'vitest';

import { formatMassLabel, formatMassMoved, formatMassUnit } from '@/lib/lift/massUnit';

describe('formatMassUnit', () => {
  it('keeps kilos as kg', () => {
    expect(formatMassUnit(0, 'kg')).toBe('kg');
    expect(formatMassUnit(1, 'kg')).toBe('kg');
    expect(formatMassUnit(80, 'kg')).toBe('kg');
  });

  it('prints 1 lb and 0 lb, otherwise lbs', () => {
    expect(formatMassUnit(0, 'lb')).toBe('lb');
    expect(formatMassUnit(1, 'lb')).toBe('lb');
    expect(formatMassUnit(2, 'lb')).toBe('lbs');
    expect(formatMassUnit(22180, 'lb')).toBe('lbs');
  });

  it('never writes a period', () => {
    expect(formatMassLabel(130, 'lb', '130')).toBe('130 lbs');
    expect(formatMassMoved(22180, 'lb', '22,180')).toBe('22,180 lbs moved');
    expect(formatMassMoved(1, 'lb', '1')).toBe('1 lb moved');
    expect(formatMassMoved(0, 'lb', '0')).toBe('0 lb moved');
  });
});
