import { describe, expect, it } from 'vitest';

import { rangeDayKeys } from '@/lib/dashboard/range';

describe('dashboard week', () => {
  it('opens on seven days ending today in the given zone', () => {
    const keys = rangeDayKeys('week', new Date('2026-10-01T18:00:00.000Z'), 'America/Chicago');
    expect(keys).toHaveLength(7);
    expect(keys[keys.length - 1]).toBe('2026-10-01');
    expect(keys[0]).toBe('2026-09-25');
  });

  it('does not count the day in UTC', () => {
    const keys = rangeDayKeys('today', new Date('2026-10-01T03:00:00.000Z'), 'UTC');
    expect(keys).not.toEqual(['2026-10-01']);
  });
});
