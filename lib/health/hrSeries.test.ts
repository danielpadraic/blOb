import { describe, expect, it } from 'vitest';

import { parseHrSeries, toStoredHrSeries } from '@/lib/health/hrSeries';

function reading(bpm: number, index: number) {
  return { at: new Date(Date.UTC(2026, 8, 5, 20, index)).toISOString(), bpm };
}

describe('storing the heart-rate trace', () => {
  it('keeps the readings in order', () => {
    const series = toStoredHrSeries([96, 104, 118].map(reading));
    expect(series).toEqual([96, 104, 118]);
  });

  it('keeps a single reading, which is a flat workout rather than no workout', () => {
    expect(toStoredHrSeries([reading(102, 0)])).toEqual([102]);
  });

  it('is null when the workout carried no heart rate', () => {
    expect(toStoredHrSeries([])).toBeNull();
  });

  it('drops sensor faults instead of flattening the whole graph around them', () => {
    // A 900 would compress every real reading into the bottom pixel of the band.
    expect(toStoredHrSeries([reading(0, 0), reading(900, 1), reading(118, 2), reading(122, 3)])).toEqual([
      118, 122,
    ]);
  });

  it('thins a long workout to something a graph can draw', () => {
    const long = Array.from({ length: 400 }, (_, index) => reading(100 + (index % 40), index));
    const series = toStoredHrSeries(long);
    expect(series).toHaveLength(120);
  });

  it('averages each bucket rather than dropping readings, so a peak survives thinning', () => {
    const long = Array.from({ length: 400 }, (_, index) => reading(index === 200 ? 180 : 100, index));
    const series = toStoredHrSeries(long) ?? [];
    expect(Math.max(...series)).toBeGreaterThan(100);
  });
});

describe('reading a stored trace back', () => {
  it('returns the series', () => {
    expect(parseHrSeries([96, 104, 118])).toEqual([96, 104, 118]);
  });

  it('tolerates numerics that arrived as strings from jsonb', () => {
    expect(parseHrSeries(['96', '104'])).toEqual([96, 104]);
  });

  it('is null for anything that is not a series', () => {
    expect(parseHrSeries(null)).toBeNull();
    expect(parseHrSeries(undefined)).toBeNull();
    expect(parseHrSeries('118')).toBeNull();
    expect(parseHrSeries([])).toBeNull();
    expect(parseHrSeries([{ bpm: 118 }])).toBeNull();
  });

  it('caps a series that arrived longer than any card can draw', () => {
    expect(parseHrSeries(Array.from({ length: 900 }, () => 110))).toHaveLength(120);
  });
});
