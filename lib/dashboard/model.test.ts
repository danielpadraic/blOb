import { describe, expect, it } from 'vitest';

import { collapseCheckinRows, durationLabel } from '@/lib/dashboard/model';

describe('dashboard rows', () => {
  it('labels cardio as duration, not a bare clock', () => {
    expect(durationLabel(41 * 60)).toBe('41 min');
    expect(durationLabel(65 * 60)).toBe('1 hr 5 min');
  });

  it('collapses the same HealthKit workout logged on two Official rooms', () => {
    const health = {
      source: 'healthkit',
      startedAt: '2026-09-30T13:00:00.000Z',
      durationSec: 3385,
    };
    const rows = collapseCheckinRows([
      {
        id: 'weekly',
        period_key: '2026-09-30',
        proof_parts: { hr: { healthWorkoutId: 'workout-1', health } },
      },
      {
        id: 'monthly',
        period_key: '2026-09-30',
        proof_parts: { hr: { healthWorkoutId: 'workout-1', health } },
      },
    ]);
    expect(rows.map((row) => row.id)).toEqual(['weekly']);
  });
});
