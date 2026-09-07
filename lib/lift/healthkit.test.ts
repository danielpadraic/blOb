import { describe, expect, it } from 'vitest';

import { overlapSeconds, rankHealthKitWorkouts, sameCalendarDay } from '@/lib/lift/healthkit';
import type { HealthWorkout } from '@/services/health/types';

function workout(partial: Partial<HealthWorkout> & { providerWorkoutId: string; startedAt: string; endedAt: string }): HealthWorkout {
  return {
    source: 'apple_health',
    activityType: 'strength',
    activityLabel: 'Traditional Strength Training',
    durationSec: 1800,
    confidence: 'watch',
    ...partial,
  };
}

describe('healthkit ranking', () => {
  it('keeps the same calendar day', () => {
    expect(sameCalendarDay('2026-09-07T18:00:00.000Z', new Date('2026-09-07T08:00:00.000Z'))).toBe(true);
  });

  it('prefers duration overlap', () => {
    const performed = '2026-09-07T18:00:00.000Z';
    const ranked = rankHealthKitWorkouts(
      [
        workout({
          providerWorkoutId: 'walk',
          activityLabel: 'Walk',
          startedAt: '2026-09-07T08:00:00.000Z',
          endedAt: '2026-09-07T08:20:00.000Z',
        }),
        workout({
          providerWorkoutId: 'lift',
          activityLabel: 'Strength',
          startedAt: '2026-09-07T18:00:00.000Z',
          endedAt: '2026-09-07T18:40:00.000Z',
        }),
      ],
      performed,
      40 * 60,
    );
    expect(ranked[0].providerWorkoutId).toBe('lift');
  });

  it('counts overlapping seconds', () => {
    expect(
      overlapSeconds(
        '2026-09-07T18:00:00.000Z',
        '2026-09-07T19:00:00.000Z',
        Date.parse('2026-09-07T18:30:00.000Z'),
        Date.parse('2026-09-07T19:30:00.000Z'),
      ),
    ).toBe(30 * 60);
  });
});
