import { describe, expect, it } from 'vitest';

import { rankHealthWorkouts } from '@/lib/health/match';
import type { HealthWorkout } from '@/services/health/types';

function workout(id: string, endedAt: string): HealthWorkout {
  return {
    providerWorkoutId: id,
    source: 'apple_health',
    activityType: 'strength',
    activityLabel: 'Traditional Strength Training',
    startedAt: '2026-09-29T15:00:00.000Z',
    endedAt,
    durationSec: 35 * 60,
    hrAvg: 120,
    confidence: 'watch',
  };
}

describe('rankHealthWorkouts', () => {
  const period = {
    from: new Date('2026-08-30T00:00:00.000Z'),
    to: new Date('2026-09-30T00:00:00.000Z'),
  };

  it('keeps a workout that already stamped another challenge', () => {
    const rows = rankHealthWorkouts([workout('used', '2026-09-29T16:00:00.000Z')], {
      period,
      keepUsed: true,
      usedIds: new Set(['used']),
    });
    expect(rows.map((row) => row.providerWorkoutId)).toEqual(['used']);
  });
});
