import { describe, expect, it } from 'vitest';

import { asLoggableList, canCheckInOnChallenge, isLoggable, loggableFormatKind, loggableStatusLine } from '@/lib/loggable';

const NOW = new Date('2026-09-09T18:00:00.000Z');
const LIVE = {
  status: 'live' as const,
  starts_at: '2026-08-01T06:00:00.000Z',
  ends_at: '2026-12-31T06:00:00.000Z',
  timezone: 'America/Denver',
};

const IN = { isParticipant: true, isCalloutObserver: false };

const thirtyDay = {
  ...LIVE,
  format: 'consistency',
  challenge_type: 'consistency',
  frequency: 'daily',
  misses_allowed: 3,
  title: '30-Day',
};

const miles128 = {
  ...LIVE,
  format: 'consistency',
  challenge_type: 'consistency',
  frequency: 'daily',
  title: 'Run 128 Miles by January 1',
  task: 'Run 128 miles',
  metrics: [{ id: 'm1', target: 128, name: 'miles', unit: 'mi' }],
  cumulative_target: 128,
  cumulative_metric: 'distance_m',
};

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

describe('isLoggable format gate', () => {
  it('treats 30-Day daily stamp as consistency (one per challenge-tz period)', () => {
    expect(loggableFormatKind(thirtyDay)).toBe('consistency');
    expect(isLoggable(thirtyDay, IN, { now: NOW })).toBe(true);
    expect(isLoggable(thirtyDay, IN, { now: NOW, submittedThisPeriod: true })).toBe(false);
    expect(isLoggable(thirtyDay, IN, { now: NOW, loggedThisPeriod: true })).toBe(false);
  });

  it('keeps Run 128 Miles loggable after a log today', () => {
    expect(loggableFormatKind(miles128)).toBe('multi');
    expect(isLoggable(miles128, IN, { now: NOW })).toBe(true);
    expect(isLoggable(miles128, IN, { now: NOW, submittedThisPeriod: true })).toBe(true);
    expect(isLoggable(miles128, IN, { now: NOW, loggedThisPeriod: true })).toBe(true);
  });

  it('treats format=points as multi-submit', () => {
    const prayer = { ...LIVE, format: 'points', challenge_type: 'points', title: 'Prayer' };
    expect(loggableFormatKind(prayer)).toBe('multi');
    expect(isLoggable(prayer, IN, { now: NOW, submittedThisPeriod: true })).toBe(true);
  });

  it('treats a 128-mile title as multi even without stored metrics', () => {
    const titled = {
      ...LIVE,
      format: 'consistency',
      challenge_type: 'consistency',
      frequency: 'daily',
      title: 'Run 128 Miles by January 1',
      task: 'Run 128 miles',
    };
    expect(loggableFormatKind(titled)).toBe('multi');
    expect(isLoggable(titled, IN, { now: NOW, submittedThisPeriod: true })).toBe(true);
  });

  it('leaves a one-mile daily habit on the period gate', () => {
    const dailyMile = {
      ...LIVE,
      format: 'consistency',
      challenge_type: 'consistency',
      frequency: 'daily',
      title: 'Run 1 mile every morning',
    };
    expect(loggableFormatKind(dailyMile)).toBe('consistency');
    expect(isLoggable(dailyMile, IN, { now: NOW, submittedThisPeriod: true })).toBe(false);
  });

  it('does not use a missing join as loggable', () => {
    expect(isLoggable(miles128, { isParticipant: false }, { now: NOW })).toBe(false);
  });

  it('omits ended and not-yet-started rows', () => {
    expect(isLoggable({ ...thirtyDay, status: 'settled' }, IN, { now: NOW })).toBe(false);
    expect(
      isLoggable({ ...thirtyDay, starts_at: '2026-09-10T06:00:00.000Z' }, IN, { now: NOW }),
    ).toBe(false);
  });
});
