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
import { buildWorkoutRoute, projectRoute } from '@/lib/health/route';
import { parseCheckinHealthProof } from '@/lib/health/checkinHealthProof';

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
    expect(card.headline).toEqual({ value: '0:41:10', label: 'Workout time' });
    expect(card.route).toBeNull();
    expect(card.stats.map((stat) => stat.label)).toEqual(['Active cal', 'Avg HR', 'Max HR']);
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
    expect(card.headline.label).toBe('Workout time');
    expect(card.stats.map((stat) => stat.label)).toEqual(['Active cal']);
  });

  it('omits calories and distance rather than printing zero', () => {
    const card = buildWorkoutProofCard({
      workout: { ...WORKOUT, caloriesKcal: 0, distanceM: 0 },
      samples: [],
      timeZone: TZ,
      challengeTitle: 'Prayer Challenge',
    });
    expect(card.headline.label).toBe('Workout time');
    expect(card.stats.map((stat) => stat.key)).toEqual(['hr', 'hrmax']);
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
    expect(card.headline).toEqual({ value: '5.00 mi', label: 'Distance' });
    expect(card.stats.map((stat) => stat.key)).toEqual(['duration', 'active', 'hr', 'hrmax']);
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

describe('route on the card', () => {
  const locations = Array.from({ length: 80 }, (_, index) => {
    const angle = (index / 80) * Math.PI * 2;
    return {
      latitude: 43.6955 + Math.sin(angle) * 0.009,
      longitude: -116.3539 + Math.cos(angle) * 0.012,
      timestamp: new Date(Date.parse('2026-09-04T13:33:00.000Z') + index * 30_000).toISOString(),
    };
  });

  const workout: HealthWorkout = {
    id: 'w-route',
    providerWorkoutId: 'hk-route',
    source: 'apple_health',
    activityType: 'running',
    activityLabel: 'Outdoor Run',
    startedAt: '2026-09-04T13:33:00.000Z',
    endedAt: '2026-09-04T14:14:10.000Z',
    durationSec: 2470,
    caloriesKcal: 612,
    distanceM: 8450,
    hrAvg: 152,
    hrMax: 178,
    confidence: 'watch',
  };

  it('leads with distance and carries the route when one exists', () => {
    const route = buildWorkoutRoute({ locations, activityType: 'running' });
    const card = buildWorkoutProofCard({
      workout,
      timeZone: 'America/Denver',
      challengeTitle: '30-Day Consistency',
      route,
    });
    expect(card.headline).toEqual({ value: '5.25 mi', label: 'Distance' });
    expect(card.route?.polyline.length).toBe(80);
    expect(card.accent.accent).toBe('#FF7A4D');
    // Duration moves into the strip so the headline number is never printed twice.
    expect(card.stats.map((stat) => stat.key)).toEqual(['duration', 'active', 'hr', 'hrmax']);
  });

  it('has no route and leads with time for an indoor workout', () => {
    const card = buildWorkoutProofCard({
      workout: { ...workout, activityType: 'strength', activityLabel: 'Traditional Strength Training', distanceM: undefined },
      timeZone: 'America/Denver',
      challengeTitle: '30-Day Consistency',
    });
    expect(card.route).toBeNull();
    expect(card.headline).toEqual({ value: '0:41:10', label: 'Workout time' });
    expect(card.accent.accent).toBe('#72D9CB');
  });

  /**
   * The web renderer never talks to HealthKit. This is the path it relies on: a route captured on a
   * device, stored as jsonb, read back and projected into a drawable line.
   */
  it('redraws a stored route after a round trip through jsonb', () => {
    const route = buildWorkoutRoute({ locations, activityType: 'running' });
    const storedJson = JSON.parse(JSON.stringify({ ...toStoredProof(workout), route }));
    const parsed = parseCheckinHealthProof(storedJson);
    expect(parsed?.route?.kind).toBe('gps');

    const card = buildWorkoutProofCard({
      workout,
      timeZone: 'America/Denver',
      challengeTitle: '30-Day Consistency',
      route: parsed?.route ?? null,
    });
    const projected = projectRoute(card.route!, { width: 872, height: 520 });
    expect(projected.path.startsWith('M')).toBe(true);
    expect(projected.points.length).toBe(80);
  });

  it('drops a route that arrived on a screenshot read, because OCR cannot know a location', () => {
    const route = buildWorkoutRoute({ locations, activityType: 'running' });
    const parsed = parseCheckinHealthProof({
      source: 'ocr',
      activityType: 'running',
      sourceName: 'Screenshot',
      durationSec: 2470,
      activeEnergyKcal: 612,
      route,
    });
    expect(parsed?.source).toBe('ocr');
    expect(parsed?.route).toBeUndefined();
  });
});

/** Minimal stored shape for the round-trip test, mirroring what the attach path writes. */
function toStoredProof(workout: HealthWorkout) {
  return {
    source: 'healthkit',
    activityType: workout.activityType,
    sourceName: 'Apple Watch',
    startedAt: workout.startedAt,
    endedAt: workout.endedAt,
    durationSec: workout.durationSec,
    activeEnergyKcal: workout.caloriesKcal,
    distanceMeters: workout.distanceM,
    avgHrBpm: workout.hrAvg,
    maxHrBpm: workout.hrMax,
  };
}
