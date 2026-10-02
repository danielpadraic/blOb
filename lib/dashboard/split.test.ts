import { describe, expect, it } from 'vitest';

import { bodyCards, enteredFromParts, mergeLiftHealthSessions, poundsByDay, sessionVisible, syncDayLabel } from '@/lib/dashboard/split';
import { bucketBodyPoints, sleepMinutesFromSamples } from '@/lib/health/bodyDays';

describe('effort stays on blOb rows', () => {
  it('adds lift pounds and ignores a watch workout', () => {
    const pounds = poundsByDay([
      { day: '2026-10-01', pounds: 4000 },
      { day: '2026-10-01', pounds: 0 },
    ]);
    expect(pounds.get('2026-10-01')).toBe(4000);
    expect(
      enteredFromParts({
        hr: {
          method: 'hr',
          health: { source: 'healthkit', distanceMeters: 8000, steps: 9000 },
        },
        steps: { method: 'steps', text: '4,200' },
        distance: { method: 'distance', text: '3.1 mi' },
      }),
    ).toEqual({ miles: 3.1, steps: 4200 });
  });

  it('keeps one distance and both chips when a lift overlaps a watch workout', () => {
    const rows = mergeLiftHealthSessions([
      {
        id: 'lift-1',
        title: 'Push',
        start: '2026-10-01T14:00:00.000Z',
        end: '2026-10-01T15:00:00.000Z',
        day: '2026-10-01',
        sources: ['lift'],
        distanceMeters: 1609,
        pounds: 5000,
        href: '/lift/lift-1',
      },
      {
        id: 'hk-1',
        title: 'Strength',
        start: '2026-10-01T14:10:00.000Z',
        end: '2026-10-01T14:50:00.000Z',
        day: '2026-10-01',
        sources: ['healthkit'],
        distanceMeters: 3200,
        pounds: 0,
        href: null,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.sources).toEqual(['lift', 'healthkit']);
    expect(rows[0]?.distanceMeters).toBe(1609);
    expect(rows[0]?.pounds).toBe(5000);
    expect(rows[0]?.start).toBe('2026-10-01T14:10:00.000Z');
    expect(rows[0]?.end).toBe('2026-10-01T14:50:00.000Z');
  });

  it('hides rows with the source filter and leaves pounds alone', () => {
    const pounds = poundsByDay([{ day: '2026-10-01', pounds: 1000 }]);
    const rows = mergeLiftHealthSessions([
      {
        id: 'lift-1',
        title: 'Push',
        start: '2026-10-01T14:00:00.000Z',
        end: '2026-10-01T15:00:00.000Z',
        day: '2026-10-01',
        sources: ['lift'],
        distanceMeters: null,
        pounds: 1000,
        href: '/lift/lift-1',
      },
      {
        id: 'walk',
        title: 'Walk',
        start: '2026-10-01T18:00:00.000Z',
        end: '2026-10-01T18:30:00.000Z',
        day: '2026-10-01',
        sources: ['healthkit'],
        distanceMeters: 2000,
        pounds: 0,
        href: null,
      },
    ]);
    expect(rows.filter((row) => sessionVisible(row, 'healthkit')).map((row) => row.id)).toEqual(['walk']);
    expect(pounds.get('2026-10-01')).toBe(1000);
  });
});

describe('body cards', () => {
  it('omits a metric that never came back and collapses duplicate calories', () => {
    const cards = bodyCards(
      [
        {
          day: '2026-10-01',
          provider: 'apple_health',
          steps: 8000,
          moveKcal: 420,
          calories: 420,
          standHours: null,
          heartRate: 0,
        },
      ],
      ['2026-10-01'],
      () => 'T',
    );
    expect(cards.map((card) => card.key)).toEqual(['steps', 'move']);
    expect(cards.find((card) => card.key === 'steps')?.source).toBe('healthkit');
  });

  it('labels the sync day in Chicago and refuses UTC', () => {
    expect(syncDayLabel('2026-10-02T15:00:00.000Z', 'America/Chicago')).toBe('Synced Fri, Oct 2');
    expect(syncDayLabel('2026-10-02T15:00:00.000Z', 'UTC')).toBe('');
  });

  it('buckets a phone sample into the device day', () => {
    const days = bucketBodyPoints(
      [{ at: '2026-10-02T04:30:00.000Z', value: 1000, kind: 'steps' }],
      'America/Chicago',
      'apple_health',
    );
    expect(days).toEqual([
      {
        day: '2026-10-01',
        provider: 'apple_health',
        steps: 1000,
        calories: null,
        standHours: null,
        moveKcal: null,
        exerciseMin: null,
        sleepMin: null,
        heartRate: null,
      },
    ]);
    expect(bucketBodyPoints([{ at: '2026-10-02T04:30:00.000Z', value: 10, kind: 'steps' }], 'UTC')).toEqual([]);
  });

  it('counts asleep time and skips in-bed when asleep exists', () => {
    const minutes = sleepMinutesFromSamples([
      { start: '2026-10-01T05:00:00.000Z', end: '2026-10-01T06:00:00.000Z', value: 'INBED' },
      { start: '2026-10-01T05:00:00.000Z', end: '2026-10-01T05:30:00.000Z', value: 'ASLEEP' },
    ]);
    expect(minutes).toEqual([{ at: '2026-10-01T05:00:00.000Z', minutes: 30 }]);
  });
});
