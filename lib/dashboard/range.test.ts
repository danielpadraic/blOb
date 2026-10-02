import { describe, expect, it } from 'vitest';

import { rangeDayKeys } from '@/lib/dashboard/range';

describe('dashboard week', () => {
  it('opens on seven days ending today in the given zone', () => {
    const keys = rangeDayKeys('week', new Date('2026-10-01T18:00:00.000Z'), 'America/Chicago');
    expect(keys).toHaveLength(7);
    expect(keys[keys.length - 1]).toBe('2026-10-01');
    expect(keys[0]).toBe('2026-09-25');
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
