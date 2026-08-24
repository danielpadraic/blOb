import { describe, expect, it } from 'vitest';

import { asLoggableList, loggableStatusLine } from './loggable';

describe('loggable Check In list', () => {
  it('keeps every open challenge instead of collapsing to the first', () => {
    expect(asLoggableList([{ id: 'a' }, { id: 'b' }]).map((row) => row.id)).toEqual(['a', 'b']);
    expect(asLoggableList({ id: 'only' }).map((row) => row.id)).toEqual(['only']);
    expect(asLoggableList(null)).toEqual([]);
  });

  it('labels due-today and day progress', () => {
    expect(
      loggableStatusLine({
        ends_at: '2026-08-24T23:59:00.000Z',
        days_required: 10,
        daysCompleted: 2,
        todayKey: '2026-08-24',
      }),
    ).toBe('Due today');
    expect(
      loggableStatusLine({
        ends_at: '2026-08-31T23:59:00.000Z',
        days_required: 10,
        daysCompleted: 2,
        todayKey: '2026-08-24',
      }),
    ).toBe('Day 3 of 10');
  });
});
