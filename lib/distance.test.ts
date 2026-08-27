import { describe, expect, it } from 'vitest';

import {
  amountToMeters,
  athleteDistanceUnit,
  distanceProofSentence,
  distanceShortHint,
  formatDistance,
  milesToMeters,
  parseDistanceText,
  parseSessionDistanceText,
  snapDistanceAmount,
} from '@/lib/distance';

describe('distance units', () => {
  it('follows the athlete: lb is miles, kg is km', () => {
    expect(athleteDistanceUnit('lb')).toBe('mi');
    expect(athleteDistanceUnit('kg')).toBe('km');
    expect(athleteDistanceUnit(null)).toBe('mi');
  });

  it('stores meters and formats miles', () => {
    expect(milesToMeters(1)).toBe(1609);
    expect(formatDistance(160934, 'mi')).toMatch(/100/);
    expect(snapDistanceAmount(0.1)).toBe(0.25);
    expect(amountToMeters(1, 'mi')).toBe(1609);
  });

  it('parses typed miles and km', () => {
    expect(parseDistanceText('1.00')).toBe(1609);
    expect(parseDistanceText('1 km')).toBe(1000);
    expect(parseDistanceText('')).toBeNull();
  });

  it('keeps a session distance like 0.4 without snapping to 0.25 steps', () => {
    expect(parseSessionDistanceText('0.4')).toBe(644);
    expect(parseSessionDistanceText('12.0')).toBe(19312);
    expect(parseDistanceText('0.4')).toBe(805);
  });

  it('writes the Distance proof sentence and short hint', () => {
    expect(distanceProofSentence(milesToMeters(1), 'mi')).toBe(
      'Attach a run or walk of at least 1.00 miles.',
    );
    expect(distanceShortHint(998, 1609, 'mi')).toBe('This run is 0.62 mi. This task needs 1.00 mi.');
  });
});
