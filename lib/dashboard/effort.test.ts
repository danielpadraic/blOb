import { describe, expect, it } from 'vitest';

import { cardioLines, effortFromLiftRows, exerciseChipNames, muscleChipKeys, poundChart, workSetPounds } from '@/lib/dashboard/effort';
import type { EffortSession } from '@/lib/dashboard/effort';

const sessions: EffortSession[] = [
  {
    id: 'done',
    day: '2026-10-01',
    unit: 'lb',
    muscles: ['chest'],
    exercises: [
      { name: 'Bench Press', muscle: 'chest', pounds: 4000 },
      { name: 'Fly', muscle: 'chest', pounds: 800 },
    ],
    cardio: [{ name: 'Air Bike', type: 'sprint', typeLabel: 'Sprint', seconds: 22 * 60, distanceMeters: null }],
  },
  {
    id: 'quiet',
    day: '2026-09-30',
    unit: 'lb',
    muscles: ['back'],
    exercises: [{ name: 'Row', muscle: 'back', pounds: 2000 }],
    cardio: [],
  },
];

describe('completed lift pounds', () => {
  it('ignores a set that was not completed', () => {
    expect(
      workSetPounds([
        { kind: 'work', weight: 100, reps: 5, completedAt: '2026-10-01T12:00:00Z' },
        { kind: 'work', weight: 100, reps: 5, completedAt: null },
        { kind: 'warmup', weight: 45, reps: 10, completedAt: '2026-10-01T12:00:00Z' },
      ]),
    ).toBe(500);
  });

  it('follows the muscle chip and keeps a quiet day at zero', () => {
    const chart = poundChart(sessions, ['2026-09-30', '2026-10-01'], { muscle: 'chest', exercise: null }, () => 'W');
    expect(chart.totalLabel).toBe('4,800 lb');
    expect(chart.bars.map((bar) => bar.value)).toEqual([0, 4800]);
    expect(chart.bars[1]?.hint).toBe('Thu · 4,800 lb');
    expect(muscleChipKeys(sessions)).toEqual(['chest', 'back']);
    expect(exerciseChipNames(sessions, 'chest')).toEqual(['Bench Press', 'Fly']);
  });

  it('drops a draft and keeps the stored exercise name', () => {
    const built = effortFromLiftRows(
      [
        {
          id: 'draft',
          status: 'open',
          completed_at: null,
          lift_session_exercises: [{ name: 'Squat', kind: 'strength', muscle_key: 'quads', lift_sets: [{ kind: 'work', weight: 200, reps: 5, completed_at: '2026-10-01' }] }],
        },
        {
          id: 'done',
          status: 'completed',
          completed_at: '2026-10-01T18:00:00.000Z',
          unit: 'lb',
          muscle_keys: ['quads'],
          lift_session_exercises: [
            { name: 'Back Squat', kind: 'strength', muscle_key: 'quads', lift_sets: [{ kind: 'work', weight: 200, reps: 5, completed_at: '2026-10-01' }] },
          ],
        },
      ],
      () => '2026-10-01',
    );
    expect(built.map((row) => row.id)).toEqual(['done']);
    expect(built[0]?.exercises[0]?.name).toBe('Back Squat');
  });

  it('lists cardio that was saved and skips a day with none', () => {
    const lines = cardioLines(sessions, ['2026-09-30', '2026-10-01'], null);
    expect(lines.types.map((row) => row.label)).toEqual(['Sprint']);
    expect(lines.lines.map((row) => row.text)).toEqual(['Thu · Air Bike · Sprint · 22 min']);
    expect(cardioLines(sessions, ['2026-09-30'], 'sprint').lines).toEqual([]);
  });
});
