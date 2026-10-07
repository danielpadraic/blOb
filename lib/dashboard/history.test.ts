import { describe, expect, it } from 'vitest';

import { workoutHistoryDays } from '@/lib/dashboard/history';

describe('workout history', () => {
  it('puts health, a completed lift, and cardio on one day', () => {
    const rows = workoutHistoryDays({
      health: [
        {
          day: '2026-10-07',
          activity: 'Outdoor Walk',
          durationSec: 36 * 60 + 12,
          hrAvg: 142,
          distanceMeters: 1609.344 * 3.2,
          href: '/challenges/weekly',
        },
      ],
      lifts: [{ day: '2026-10-07', title: 'Push', pounds: 12400, unit: 'lb', href: '/lift/abc' }],
      cardio: [{ day: '2026-10-07', typeLabel: 'Steady', seconds: 24 * 60, distanceMeters: 1609.344 * 2 }],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.label).toBe('Wed, Oct 7');
    expect(rows[0]?.lines.map((line) => line.text)).toEqual([
      'Outdoor Walk · 36:12 · 142 bpm · 3.20 mi',
      'Push · 12,400 lbs',
      'Steady · 2.00 mi · 24:00',
    ]);
    expect(rows[0]?.href).toBe('/challenges/weekly');
  });

  it('leaves empty days off the list', () => {
    expect(
      workoutHistoryDays({
        health: [],
        lifts: [{ day: '2026-10-08', title: 'Legs', pounds: 8000, unit: 'lb', href: '/lift/legs' }],
        cardio: [],
      }).map((row) => row.day),
    ).toEqual(['2026-10-08']);
  });

  it('is empty when the window has no workouts', () => {
    expect(workoutHistoryDays({ health: [], lifts: [], cardio: [] })).toEqual([]);
  });

  it('opens the lift when that day has no check-in', () => {
    const rows = workoutHistoryDays({
      health: [{ day: '2026-10-06', activity: 'walking', durationSec: 1200, hrAvg: 110, href: null }],
      lifts: [],
      cardio: [],
    });
    expect(rows[0]?.lines[0]?.text).toBe('Walking · 20:00 · 110 bpm');
    expect(rows[0]?.href).toBeNull();
  });
});
