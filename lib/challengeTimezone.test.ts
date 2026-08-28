import { describe, expect, it } from 'vitest';

import {
  addZonedCalendarDays,
  isChallengeRouteId,
  startTomorrowInZone,
} from '@/lib/challengeTimezone';

describe('startTomorrowInZone', () => {
  it('uses the next Denver calendar date, not UTC midnight that is still today', () => {
    const elevenPmDenver = new Date('2026-08-28T05:00:00.000Z');
    const start = startTomorrowInZone(elevenPmDenver, 'America/Denver');
    expect(start.toISOString()).toBe('2026-08-28T06:00:00.000Z');
  });

  it('does not use Date.now()+24h when that instant is still today locally', () => {
    const tenAmDenver = new Date('2026-08-27T16:00:00.000Z');
    const plus24h = new Date(tenAmDenver.getTime() + 24 * 60 * 60 * 1000);
    const start = startTomorrowInZone(tenAmDenver, 'America/Denver');
    expect(start.toISOString()).toBe('2026-08-28T06:00:00.000Z');
    expect(start.getTime()).toBeLessThan(plus24h.getTime());
    expect(start.getTime()).toBeGreaterThan(tenAmDenver.getTime());
  });
});

describe('addZonedCalendarDays', () => {
  it('keeps a 30-day window on the same Denver clock', () => {
    const ends = addZonedCalendarDays('2026-08-28T06:00:00.000Z', 30, 'America/Denver');
    expect(ends).toBe('2026-09-27T06:00:00.000Z');
  });
});

describe('isChallengeRouteId', () => {
  it('accepts a real uuid and rejects leftover titles', () => {
    expect(isChallengeRouteId('2f1d3c4b-5a67-4890-abcd-ef0123456789')).toBe(true);
    expect(isChallengeRouteId('Workout Group #2')).toBe(false);
    expect(isChallengeRouteId('')).toBe(false);
  });
});
