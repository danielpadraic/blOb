import { describe, expect, it } from 'vitest';

import { parseCheckinHealthProof } from '@/lib/health/checkinHealthProof';
import { buildOcrHealthProof, ocrWorkoutWindow } from '@/lib/health/ocrSession';
import { parseOcrClockRange } from '@/lib/health/workoutOcr';

const DENVER = 'America/Denver';

describe('wall-clock range parsing', () => {
  it('reads the Apple Fitness range with a single trailing meridiem', () => {
    expect(parseOcrClockRange('7:33 AM - 8:14 AM')).toEqual({
      start: { hour: 7, minute: 33 },
      end: { hour: 8, minute: 14 },
    });
  });

  it('resolves an implicit first meridiem from the second', () => {
    expect(parseOcrClockRange('5:40 - 6:25 PM')).toEqual({
      start: { hour: 17, minute: 40 },
      end: { hour: 18, minute: 25 },
    });
  });

  it('handles noon and midnight correctly', () => {
    expect(parseOcrClockRange('12:05 AM - 12:40 AM')?.start).toEqual({ hour: 0, minute: 5 });
    expect(parseOcrClockRange('12:05 PM - 12:40 PM')?.start).toEqual({ hour: 12, minute: 5 });
  });

  it('returns null when the screen showed no range', () => {
    expect(parseOcrClockRange('Total Time 0:41:10 Active Calories 312 CAL')).toBeNull();
    expect(parseOcrClockRange('')).toBeNull();
  });
});

describe('resolving the window in the challenge timezone', () => {
  it('anchors the clock range to the check-in day, not to now', () => {
    const window = ocrWorkoutWindow({
      range: parseOcrClockRange('7:33 AM - 8:14 AM'),
      periodKey: '2026-09-04',
      timeZone: DENVER,
    });
    // Denver is UTC-6 in September, so 7:33 local is 13:33Z.
    expect(window?.startedAt).toBe('2026-09-04T13:33:00.000Z');
    expect(window?.endedAt).toBe('2026-09-04T14:14:00.000Z');
  });

  it('rolls the end onto the next day when the session crossed midnight', () => {
    const window = ocrWorkoutWindow({
      range: parseOcrClockRange('11:40 PM - 12:15 AM'),
      periodKey: '2026-09-04',
      timeZone: DENVER,
    });
    expect(window?.startedAt).toBe('2026-09-05T05:40:00.000Z');
    expect(window?.endedAt).toBe('2026-09-05T06:15:00.000Z');
  });

  it('returns null when there is no range to anchor', () => {
    expect(ocrWorkoutWindow({ range: parseOcrClockRange('no times here'), periodKey: '2026-09-04', timeZone: DENVER })).toBeNull();
  });

  it('returns null on a malformed period key rather than guessing a day', () => {
    expect(ocrWorkoutWindow({ range: parseOcrClockRange('7:33 AM - 8:14 AM'), periodKey: 'today', timeZone: DENVER })).toBeNull();
  });
});

describe('building the stored snapshot', () => {
  const fields = { durationSec: 2470, activeEnergyKcal: 312, avgHrBpm: 108 };

  it('never invents a window when the screen had no clock range', () => {
    const snapshot = buildOcrHealthProof({
      fields,
      source: 'ocr',
      clockRange: parseOcrClockRange('Total Time 0:41:10 Active Calories 312 CAL Avg. Heart Rate 108 BPM'),
      periodKey: '2026-09-04',
      timeZone: DENVER,
    });
    expect(snapshot?.startedAt).toBeUndefined();
    expect(snapshot?.endedAt).toBeUndefined();
    expect(snapshot?.durationSec).toBe(2470);
  });

  it('keeps a real window when the screen showed one', () => {
    const snapshot = buildOcrHealthProof({
      fields,
      source: 'ocr',
      clockRange: parseOcrClockRange('Traditional Strength Training 7:33 AM - 8:14 AM Total Time 0:41:10'),
      periodKey: '2026-09-04',
      timeZone: DENVER,
    });
    expect(snapshot?.startedAt).toBe('2026-09-04T13:33:00.000Z');
    // Duration still comes from the elapsed time on the screen, not from the window span.
    expect(snapshot?.durationSec).toBe(2470);
  });

  it('marks an edited session as manual', () => {
    expect(buildOcrHealthProof({ fields, source: 'manual' })?.source).toBe('manual');
    expect(buildOcrHealthProof({ fields, source: 'manual' })?.sourceName).toBe('Entered by hand');
  });

  it('returns null when nothing was read', () => {
    expect(buildOcrHealthProof({ fields: {}, source: 'ocr' })).toBeNull();
  });

  it('derives an activity bucket from the read label', () => {
    expect(buildOcrHealthProof({ fields, source: 'ocr', activityLabel: 'Outdoor Run' })?.activityType).toBe(
      'running',
    );
    expect(
      buildOcrHealthProof({ fields, source: 'ocr', activityLabel: 'High Intensity Interval Training' })
        ?.activityType,
    ).toBe('strength');
    expect(buildOcrHealthProof({ fields, source: 'ocr' })?.activityType).toBe('other');
  });
});

describe('round trip through parseCheckinHealthProof', () => {
  it('accepts an ocr snapshot with no clocks', () => {
    const snapshot = buildOcrHealthProof({
      fields: { durationSec: 2470, activeEnergyKcal: 312 },
      source: 'ocr',
    });
    expect(parseCheckinHealthProof(snapshot)).toEqual(snapshot);
  });

  it('still rejects a healthkit snapshot that is missing its window', () => {
    expect(
      parseCheckinHealthProof({
        source: 'healthkit',
        activityType: 'strength',
        sourceName: 'Apple Watch',
        durationSec: 2470,
      }),
    ).toBeNull();
  });

  it('treats a legacy row with no source as a healthkit attach', () => {
    const parsed = parseCheckinHealthProof({
      startedAt: '2026-09-04T13:25:43.056Z',
      endedAt: '2026-09-04T14:15:44.562Z',
      durationSec: 3002,
      activityType: 'strength',
      sourceName: 'Apple Watch',
      avgHrBpm: 137,
    });
    expect(parsed?.source).toBe('healthkit');
    expect(parsed?.avgHrBpm).toBe(137);
  });

  it('rejects an ocr snapshot with no numbers at all', () => {
    expect(
      parseCheckinHealthProof({ source: 'ocr', activityType: 'other', sourceName: 'Workout screenshot' }),
    ).toBeNull();
  });
});
