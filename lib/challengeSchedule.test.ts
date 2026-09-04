import { describe, expect, it } from 'vitest';

import {
  inOneHour,
  resolveStartForPublish,
  startPresetFromValues,
  tomorrowMorning,
} from '@/lib/challengeSchedule';
import { startTomorrowInZone } from '@/lib/challengeTimezone';

describe('challenge start presets', () => {
  it('resolves hour at T+3h to about 1 hour from then, not the original stamp', () => {
    const savedAt = new Date('2026-08-26T12:00:00.000Z');
    const original = inOneHour(savedAt).toISOString();
    const later = new Date(savedAt.getTime() + 3 * 60 * 60 * 1000);
    const resolved = resolveStartForPublish({
      preset: 'hour',
      starts_at: original,
      duration_days: 7,
      now: later,
    });
    expect(Math.abs(new Date(resolved.starts_at).getTime() - inOneHour(later).getTime())).toBeLessThan(2000);
    expect(resolved.starts_at).not.toBe(original);
  });

  it('defaults Start tomorrow to next Denver morning, not UTC date and not today', () => {
    const elevenPmDenver = new Date('2026-08-28T05:00:00.000Z');
    const utcDate = elevenPmDenver.toISOString().slice(0, 10);
    const resolved = resolveStartForPublish({
      preset: 'tomorrow',
      duration_days: 7,
      now: elevenPmDenver,
    });
    expect(tomorrowMorning(elevenPmDenver).toISOString()).toBe('2026-08-28T06:00:00.000Z');
    expect(resolved.starts_at).toBe(startTomorrowInZone(elevenPmDenver, 'America/Denver').toISOString());
    expect(resolved.starts_at).toBe('2026-08-28T06:00:00.000Z');
    expect(resolved.starts_at).not.toBe(`${utcDate}T00:00:00.000Z`);
    expect(resolved.starts_at).not.toBe('2026-08-29T00:00:00.000Z');
    expect(new Date(resolved.starts_at).getTime()).toBeGreaterThan(elevenPmDenver.getTime());
  });

  it('resolves Start tomorrow as the next Denver calendar date with a 30-day end', () => {
    const tenAmDenver = new Date('2026-08-27T16:00:00.000Z');
    const resolved = resolveStartForPublish({
      preset: 'tomorrow',
      starts_at: tenAmDenver.toISOString(),
      duration_days: 30,
      timezone: 'America/Denver',
      now: tenAmDenver,
    });
    expect(resolved.starts_at).toBe(startTomorrowInZone(tenAmDenver, 'America/Denver').toISOString());
    expect(resolved.ends_at).toBe('2026-09-27T06:00:00.000Z');
    expect(new Date(resolved.starts_at).getTime()).toBeGreaterThan(tenAmDenver.getTime());
  });

  it('keeps a custom start in the past as custom', () => {
    const past = '2020-01-01T15:00:00.000Z';
    const resolved = resolveStartForPublish({
      preset: 'custom',
      starts_at: past,
      duration_days: 7,
      now: new Date('2026-08-26T18:00:00.000Z'),
    });
    expect(resolved.starts_at).toBe(new Date(past).toISOString());
    expect(startPresetFromValues(past, new Date('2026-08-26T18:00:00.000Z'))).toBe('custom');
  });
});
