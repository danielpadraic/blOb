import { describe, expect, it } from 'vitest';

import { preferredUnitSystem, unitSystemFromWeightUnit } from '@/lib/bodyMetrics';
import { athleteDistanceUnit } from '@/lib/distance';

describe('measurement defaults', () => {
  it('treats unset or unknown weight_unit as imperial', () => {
    expect(unitSystemFromWeightUnit(null)).toBe('imperial');
    expect(unitSystemFromWeightUnit(undefined)).toBe('imperial');
    expect(unitSystemFromWeightUnit('lb')).toBe('imperial');
    expect(unitSystemFromWeightUnit('stone')).toBe('imperial');
    expect(unitSystemFromWeightUnit('kg')).toBe('metric');
  });

  it('honors saved kg or preferred_units metric', () => {
    expect(preferredUnitSystem({ weight_unit: 'kg' })).toBe('metric');
    expect(preferredUnitSystem({ preferred_units: 'metric' })).toBe('metric');
    expect(preferredUnitSystem({ weight_unit: 'lb', preferred_units: 'metric' })).toBe('metric');
    expect(preferredUnitSystem({ weight_unit: 'lb', preferred_units: 'imperial' })).toBe('imperial');
    expect(preferredUnitSystem(null)).toBe('imperial');
    expect(preferredUnitSystem({})).toBe('imperial');
  });

  it('uses miles unless the athlete saved metric', () => {
    expect(athleteDistanceUnit(null)).toBe('mi');
    expect(athleteDistanceUnit('lb')).toBe('mi');
    expect(athleteDistanceUnit('kg')).toBe('km');
    expect(athleteDistanceUnit('lb', 'metric')).toBe('km');
  });
});
