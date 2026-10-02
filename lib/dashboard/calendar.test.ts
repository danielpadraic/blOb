import { describe, expect, it } from 'vitest';

import { calendarCells, calendarDayKeys, dutyBounds, markCalendarDay, monthKeys } from '@/lib/dashboard/calendar';

describe('check-in calendar', () => {
  it('uses seven cells for a week and the month for October', () => {
    const now = new Date('2026-10-02T18:00:00.000Z');
    expect(calendarDayKeys('week', now, 'America/Chicago')).toHaveLength(7);
    expect(monthKeys(now, 'America/Chicago')).toHaveLength(31);
    expect(monthKeys(now, 'America/Chicago')[0]).toBe('2026-10-01');
    const month = calendarCells('month', now, 'America/Chicago');
    expect(month.showHeader).toBe(true);
    expect(month.cells.filter((cell) => cell.key).map((cell) => cell.key)).toHaveLength(31);
  });

  it('marks a complete day, misses only an unfinished required day, and leaves an open day empty of a miss', () => {
    const duty = {
      startKey: '2026-09-28',
      endKey: '2026-10-02',
      todayKey: '2026-10-02',
      complete: ['2026-09-30'],
    };
    expect(markCalendarDay('2026-09-27', [duty])).toBe('empty');
    expect(markCalendarDay('2026-09-30', [duty])).toBe('done');
    expect(markCalendarDay('2026-09-29', [duty])).toBe('miss');
    expect(markCalendarDay('2026-10-02', [duty])).toBe('due');
    expect(markCalendarDay('2026-10-03', [duty])).toBe('empty');
  });

  it('does not require days before the person joined', () => {
    const bounds = dutyBounds({
      startAt: '2026-09-28T05:00:00.000Z',
      endAt: '2026-10-05T05:00:00.000Z',
      joinedAt: '2026-10-01T15:00:00.000Z',
      timeZone: 'America/Chicago',
      now: new Date('2026-10-02T18:00:00.000Z'),
    });
    expect(bounds).toEqual({
      startKey: '2026-10-01',
      endKey: '2026-10-02',
      todayKey: '2026-10-02',
    });
    expect(
      markCalendarDay('2026-09-30', [
        { startKey: bounds?.startKey ?? '', endKey: bounds?.endKey ?? '', todayKey: '2026-10-02', complete: [] },
      ]),
    ).toBe('empty');
  });
});
