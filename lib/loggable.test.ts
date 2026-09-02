import { describe, expect, it } from 'vitest';

import { asLoggableList, canCheckInOnChallenge, loggableStatusLine } from '@/lib/loggable';

describe('loggable Check In list', () => {
  it('keeps every open challenge instead of collapsing to the first', () => {
    expect(asLoggableList([{ id: 'a' }, { id: 'b' }]).map((row) => row.id)).toEqual(['a', 'b']);
    expect(asLoggableList({ id: 'only' }).map((row) => row.id)).toEqual(['only']);
    expect(asLoggableList(null)).toEqual([]);
  });

  it('omits Callout observers from Check In', () => {
    expect(canCheckInOnChallenge({ isParticipant: true, isCalloutObserver: false })).toBe(true);
    expect(canCheckInOnChallenge({ isParticipant: false, isCalloutObserver: true })).toBe(false);
    expect(canCheckInOnChallenge({ isParticipant: true, isCalloutObserver: true })).toBe(false);
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
