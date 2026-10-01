import { describe, expect, it } from 'vitest';

import { formatCompletedDay, formatWorkoutWhen, workoutTimeZone } from '@/lib/health/workoutWhen';

const CHICAGO = 'America/Chicago';

describe('when a Health workout finished', () => {
  it('prints the completed day before a same-day clock range', () => {
    expect(
      formatWorkoutWhen({
        startedAt: '2026-10-01T12:23:00.000Z',
        endedAt: '2026-10-01T13:14:00.000Z',
        timeZone: CHICAGO,
      }),
    ).toBe('Thu, Oct 1 · 7:23–8:14 AM');
  });

  it('keeps both meridiems when the same day crosses noon', () => {
    expect(
      formatWorkoutWhen({
        startedAt: '2026-10-01T16:45:00.000Z',
        endedAt: '2026-10-01T17:30:00.000Z',
        timeZone: CHICAGO,
      }),
    ).toBe('Thu, Oct 1 · 11:45 AM–12:30 PM');
  });

  it('names both dates when the workout crosses midnight', () => {
    expect(
      formatWorkoutWhen({
        startedAt: '2026-10-01T04:40:00.000Z',
        endedAt: '2026-10-01T05:10:00.000Z',
        timeZone: CHICAGO,
      }),
    ).toBe('Wed, Sep 30, 11:40 PM – Thu, Oct 1, 12:10 AM');
  });

  it('uses the day the workout ended, not the day it started', () => {
    expect(formatCompletedDay('2026-10-01T05:10:00.000Z', CHICAGO)).toBe('Thu, Oct 1');
    expect(formatCompletedDay('2026-10-01T04:40:00.000Z', CHICAGO)).toBe('Wed, Sep 30');
  });

  it('stays blank when a clock is missing', () => {
    expect(formatWorkoutWhen({ startedAt: '2026-10-01T12:23:00.000Z', timeZone: CHICAGO })).toBe('');
    expect(formatWorkoutWhen({ endedAt: '2026-10-01T13:14:00.000Z', timeZone: CHICAGO })).toBe('');
    expect(formatCompletedDay(null, CHICAGO)).toBe('');
    expect(formatCompletedDay('not-a-date', CHICAGO)).toBe('');
  });

  it('does not format in UTC', () => {
    expect(workoutTimeZone('UTC')).not.toBe('UTC');
    expect(workoutTimeZone('utc')).not.toBe('UTC');
  });
});
