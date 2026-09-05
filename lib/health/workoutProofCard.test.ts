import { describe, expect, it } from 'vitest';

import {
  buildWorkoutProofCard,
  workoutCardDateLine,
  workoutCardDistance,
  workoutCardDuration,
  workoutCardHeartRateAverage,
  workoutCardSourceLine,
  workoutCardSparkline,
  workoutCardTimeRange,
  type HeartRateSample,
} from '@/lib/health/workoutProofCard';
import type { HealthWorkout } from '@/services/health/types';

const WORKOUT: HealthWorkout = {
  providerWorkoutId: 'hw-1',
  source: 'apple_health',
  activityType: 'strength',
  activityLabel: 'Traditional Strength Training',
  // 7:33 AM to 8:14 AM Mountain on Sept 5 2026.
  startedAt: '2026-09-05T13:33:00.000Z',
  endedAt: '2026-09-05T14:14:10.000Z',
  durationSec: 2470,
  caloriesKcal: 412,
  hrAvg: 108,
  hrMax: 141,
  confidence: 'watch',
};

const TZ = 'America/Denver';

function samples(values: number[]): HeartRateSample[] {
  return values.map((bpm, index) => ({
    at: new Date(Date.parse('2026-09-05T13:33:00.000Z') + index * 60_000).toISOString(),
    bpm,
  }));
}

describe('workout proof card formatting', () => {
  it('writes the date in the challenge timezone', () => {
    expect(workoutCardDateLine(WORKOUT.startedAt, TZ)).toBe('Saturday, September 5, 2026');
  });

  it('does not let the phone timezone move the date', () => {
    // 00:30 UTC is still the prior evening in Denver.
    expect(workoutCardDateLine('2026-09-05T00:30:00.000Z', TZ)).toBe('Friday, September 4, 2026');
  });

  it('collapses a shared meridiem in the time range', () => {
    expect(workoutCardTimeRange(WORKOUT.startedAt, WORKOUT.endedAt, TZ)).toBe('7:33 – 8:14 AM');
  });

  it('keeps both halves when the workout crosses noon', () => {
    expect(workoutCardTimeRange('2026-09-05T17:45:00.000Z', '2026-09-05T18:30:00.000Z', TZ)).toBe(
      '11:45 AM – 12:30 PM',
    );
  });

  it('formats duration as h:mm:ss', () => {
    expect(workoutCardDuration(2470)).toBe('0:41:10');
    expect(workoutCardDuration(3661)).toBe('1:01:01');
    expect(workoutCardDuration(0)).toBe('0:00:00');
  });

  it('hides distance when the workout has none', () => {
    expect(workoutCardDistance(0)).toBeNull();
    expect(workoutCardDistance(undefined)).toBeNull();
    expect(workoutCardDistance(1609.344)).toBe('1.00 mi');
    expect(workoutCardDistance(32186.9)).toBe('20.0 mi');
  });

  it('names the recording device', () => {
    expect(workoutCardSourceLine('watch')).toBe('Recorded on Apple Watch');
    expect(workoutCardSourceLine('phone')).toBe('Recorded on iPhone');
    expect(workoutCardSourceLine('unknown')).toBe('Recorded in Apple Health');
  });
});

describe('heart rate sparkline', () => {
  it('scales samples across the chart box', () => {
    const line = workoutCardSparkline(samples([100, 120, 140]), { width: 100, height: 50 });
    expect(line).not.toBeNull();
    expect(line?.min).toBe(100);
    expect(line?.max).toBe(140);
    expect(line?.points).toBe(3);
    // Lowest sample sits on the floor, highest on the ceiling.
    expect(line?.path).toBe('M0.0,50.0 L50.0,25.0 L100.0,0.0');
  });

  it('rides the middle instead of dividing by zero on a flat series', () => {
    const line = workoutCardSparkline(samples([120, 120, 120]), { width: 100, height: 50 });
    expect(line?.path).toBe('M0.0,25.0 L50.0,25.0 L100.0,25.0');
  });

  it('draws a single sample as a flat line', () => {
    const line = workoutCardSparkline(samples([133]), { width: 100, height: 50 });
    expect(line?.path).toBe('M0,25.0 L100.0,25.0');
    expect(line?.min).toBe(133);
  });

  it('returns null with no usable samples', () => {
    expect(workoutCardSparkline([])).toBeNull();
    expect(workoutCardSparkline(samples([0, -5]))).toBeNull();
  });

  it('sorts out-of-order samples before drawing', () => {
    const line = workoutCardSparkline(
      [
        { at: '2026-09-05T13:40:00.000Z', bpm: 140 },
        { at: '2026-09-05T13:33:00.000Z', bpm: 100 },
      ],
      { width: 100, height: 50 },
    );
    expect(line?.path).toBe('M0.0,50.0 L100.0,0.0');
  });

  it('averages the samples, falling back to the workout summary', () => {
    expect(workoutCardHeartRateAverage(samples([100, 110, 120]))).toBe(110);
    expect(workoutCardHeartRateAverage([], 108)).toBe(108);
    expect(workoutCardHeartRateAverage([], 0)).toBeNull();
  });
});

describe('buildWorkoutProofCard', () => {
  it('builds the full card for a Watch strength workout', () => {
    const card = buildWorkoutProofCard({
      workout: WORKOUT,
      samples: samples([100, 108, 116]),
      timeZone: TZ,
      challengeTitle: '30-Day Consistency',
    });
    expect(card.dateLine).toBe('Saturday, September 5, 2026');
    expect(card.activityLabel).toBe('Traditional Strength Training');
    expect(card.timeRange).toBe('7:33 – 8:14 AM');
    expect(card.heartRate.avgLine).toBe('108 BPM AVG');
    expect(card.heartRate.minLabel).toBe('100');
    expect(card.heartRate.maxLabel).toBe('116');
    expect(card.heartRate.emptyLine).toBeNull();
    expect(card.sourceLine).toBe('Recorded on Apple Watch');
    expect(card.proofLine).toBe('Proof for 30-Day Consistency');
    expect(card.stats.map((stat) => stat.label)).toEqual(['Workout time', 'Active cal', 'Avg HR']);
    expect(card.stats[0]?.value).toBe('0:41:10');
  });

  it('says heart rate is missing instead of drawing a fake graph', () => {
    const card = buildWorkoutProofCard({
      workout: { ...WORKOUT, hrAvg: undefined, hrMax: undefined },
      samples: [],
      timeZone: TZ,
      challengeTitle: 'Prayer Challenge',
    });
    expect(card.heartRate.sparkline).toBeNull();
    expect(card.heartRate.emptyLine).toBe('Heart rate not on this workout');
    expect(card.heartRate.avgLine).toBeNull();
    // The card still carries the rest of the workout.
    expect(card.stats.map((stat) => stat.label)).toEqual(['Workout time', 'Active cal']);
  });

  it('omits calories and distance rather than printing zero', () => {
    const card = buildWorkoutProofCard({
      workout: { ...WORKOUT, caloriesKcal: 0, distanceM: 0 },
      samples: [],
      timeZone: TZ,
      challengeTitle: 'Prayer Challenge',
    });
    expect(card.stats.map((stat) => stat.key)).toEqual(['duration', 'hr']);
    expect(card.distanceLine).toBeNull();
  });

  it('adds a distance stat when the workout has one', () => {
    const card = buildWorkoutProofCard({
      workout: { ...WORKOUT, activityLabel: 'Outdoor Run', distanceM: 8046.72 },
      samples: samples([120]),
      timeZone: TZ,
      challengeTitle: 'Run 128 Miles by January 1',
    });
    expect(card.distanceLine).toBe('5.00 mi');
    expect(card.stats.map((stat) => stat.key)).toEqual(['duration', 'active', 'hr', 'distance']);
  });

  it('hides the pin row when no place is known', () => {
    const card = buildWorkoutProofCard({
      workout: WORKOUT,
      timeZone: TZ,
      challengeTitle: '30-Day Consistency',
    });
    expect(card.placeLine).toBeNull();
    const withPlace = buildWorkoutProofCard({
      workout: WORKOUT,
      timeZone: TZ,
      challengeTitle: '30-Day Consistency',
      placeLabel: 'Eagle, ID',
    });
    expect(withPlace.placeLine).toBe('Eagle, ID');
  });
});

describe('heart rate average precedence', () => {
  it("uses HealthKit's stated average over the sample mean", () => {
    // The card is a proof artifact: it must match what Apple Fitness shows.
    const samples = [
      { at: '2026-09-04T13:30:00.000Z', bpm: 100 },
      { at: '2026-09-04T13:40:00.000Z', bpm: 200 },
    ];
    expect(workoutCardHeartRateAverage(samples, 137)).toBe(137);
  });

  it('falls back to the sample mean when the workout carried no average', () => {
    const samples = [
      { at: '2026-09-04T13:30:00.000Z', bpm: 100 },
      { at: '2026-09-04T13:40:00.000Z', bpm: 200 },
    ];
    expect(workoutCardHeartRateAverage(samples, null)).toBe(150);
  });
});
