import { describe, expect, it } from 'vitest';

import { rangeDayKeys } from '@/lib/dashboard/range';

describe('dashboard week', () => {
  it('is Sunday through Saturday in the phone zone, not the last 7 days', () => {
    // Thursday Oct 1 2026, afternoon Chicago.
    const keys = rangeDayKeys('week', new Date('2026-10-01T18:00:00.000Z'), 'America/Chicago');
    expect(keys).toEqual([
      '2026-09-27',
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ]);
  });

  it('keeps last 7 days and last 30 days as their own windows', () => {
    const week = rangeDayKeys('last7', new Date('2026-10-01T18:00:00.000Z'), 'America/Chicago');
    expect(week[0]).toBe('2026-09-25');
    expect(week[week.length - 1]).toBe('2026-10-01');
    expect(week).toHaveLength(7);
    const month = rangeDayKeys('last30', new Date('2026-10-01T18:00:00.000Z'), 'America/Chicago');
    expect(month).toHaveLength(30);
    expect(month[month.length - 1]).toBe('2026-10-01');
  });

  it('runs the month from the 1st through the last day', () => {
    const keys = rangeDayKeys('month', new Date('2026-10-06T18:00:00.000Z'), 'America/Chicago');
    expect(keys[0]).toBe('2026-10-01');
    expect(keys[keys.length - 1]).toBe('2026-10-31');
    expect(keys).toHaveLength(31);
  });

  it('walks a custom start and end, inclusive', () => {
    expect(
      rangeDayKeys('custom', new Date('2026-10-01T18:00:00.000Z'), 'America/Chicago', {
        start: '2026-09-28',
        end: '2026-10-01',
      }),
    ).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01']);
  });

  it('does not count the day in UTC', () => {
    const keys = rangeDayKeys('today', new Date('2026-10-01T03:00:00.000Z'), 'UTC');
    expect(keys).not.toEqual(['2026-10-01']);
  });
});
