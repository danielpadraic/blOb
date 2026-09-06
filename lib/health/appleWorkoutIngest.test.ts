import { describe, expect, it } from 'vitest';

import { activityLabelOf, milesToMeters } from '@/services/health/apple';

/**
 * react-native-health hands back HKWorkout.totalDistance in miles with no unit option, while
 * HealthWorkout.distanceM is meters. Storing the raw number is what rendered Daniel's 6.23 mi
 * Outdoor Walk as 0.00 mi, so the conversion is pinned here.
 */
describe('milesToMeters', () => {
  it('converts the 6.23 mi Outdoor Walk to meters', () => {
    expect(milesToMeters(6.23)).toBe(10026);
  });

  it('round-trips back to the same miles the Fitness app showed', () => {
    const meters = milesToMeters(6.23) ?? 0;
    expect((meters / 1609.344).toFixed(2)).toBe('6.23');
  });

  it('no longer reads as zero miles', () => {
    const meters = milesToMeters(6.23) ?? 0;
    expect(Number((meters / 1609.344).toFixed(2))).toBeGreaterThan(0);
  });

  it('treats a missing or zero vendor distance as absent, so 0.00 stays honest', () => {
    expect(milesToMeters(0)).toBeUndefined();
    expect(milesToMeters(undefined)).toBeUndefined();
    expect(milesToMeters(null)).toBeUndefined();
    expect(milesToMeters('')).toBeUndefined();
    expect(milesToMeters(-1)).toBeUndefined();
    expect(milesToMeters(Number.NaN)).toBeUndefined();
  });

  it('keeps a short walk out of the rounding hole', () => {
    expect(milesToMeters(0.1)).toBe(161);
  });
});

describe('activityLabelOf', () => {
  it('calls an outdoor walk an Outdoor Walk', () => {
    expect(activityLabelOf({ activityName: 'Walking', metadata: { HKIndoorWorkout: false } })).toBe(
      'Outdoor Walking',
    );
  });

  it('marks a treadmill walk indoor', () => {
    expect(activityLabelOf({ activityName: 'Walking', metadata: { HKIndoorWorkout: true } })).toBe(
      'Indoor Walking',
    );
  });

  it('accepts the numeric form HealthKit sometimes sends', () => {
    expect(activityLabelOf({ activityName: 'Running', metadata: { HKIndoorWorkout: 0 } })).toBe(
      'Outdoor Running',
    );
    expect(activityLabelOf({ activityName: 'Running', metadata: { HKIndoorWorkout: 1 } })).toBe(
      'Indoor Running',
    );
  });

  it('leaves the label alone when HealthKit did not say either way', () => {
    expect(activityLabelOf({ activityName: 'Walking' })).toBe('Walking');
    expect(activityLabelOf({ activityName: 'Walking', metadata: null })).toBe('Walking');
    expect(activityLabelOf({ activityName: 'Walking', metadata: {} })).toBe('Walking');
  });

  it('does not invent indoor or outdoor for activities Apple never labels that way', () => {
    expect(
      activityLabelOf({ activityName: 'TraditionalStrengthTraining', metadata: { HKIndoorWorkout: true } }),
    ).toBe('Traditional Strength Training');
    expect(activityLabelOf({ activityName: 'Pickleball', metadata: { HKIndoorWorkout: false } })).toBe(
      'Pickleball',
    );
  });

  it('does not double up when the label already says it', () => {
    expect(
      activityLabelOf({ activityName: 'Outdoor Walk', metadata: { HKIndoorWorkout: false } }),
    ).toBe('Outdoor Walk');
  });

  it('still humanizes the raw HealthKit type name', () => {
    expect(activityLabelOf({ activityName: 'HighIntensityIntervalTraining' })).toBe(
      'High Intensity Interval Training',
    );
  });
});
