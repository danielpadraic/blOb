import { describe, expect, it } from 'vitest';

import {
  classifyWorkoutScreen,
  clampOcrDistance,
  clampOcrField,
  hasOcrNumbers,
  METERS_PER_MILE,
  parseOcrDuration,
  parseWorkoutOcrText,
} from './workoutOcr';

/** Apple Fitness workout summary. The clock range above the elapsed time is the classic trap. */
const APPLE_FITNESS = `
Traditional Strength Training
Eagle, Idaho
7:33 AM - 8:14 AM
Total Time
0:41:10
Active Calories
312 CAL
Total Calories
385 CAL
Avg. Heart Rate
108 BPM
`;

const APPLE_OUTDOOR_RUN = `
Outdoor Run
Total Time
0:28:45
Distance
3.20 MI
Active Calories
298 CAL
Avg. Heart Rate
152 BPM
Max Heart Rate
171 BPM
`;

const STRAVA = `
Morning Run
Distance 5.02 km
Moving Time 26:31
Avg HR 148 bpm
Max HR 169 bpm
Calories 342
`;

const SAMSUNG_HEALTH = `
Workout
High intensity interval training
45 min
Calories burned
410 kcal
Average heart rate
139 bpm
Weight 168 lb
BMI 24.1
`;

describe('duration parsing', () => {
  it('reads elapsed time and never the wall-clock range next to it', () => {
    expect(parseOcrDuration(APPLE_FITNESS)).toBe(41 * 60 + 10);
  });

  it('reads a labelled mm:ss moving time', () => {
    expect(parseOcrDuration(STRAVA)).toBe(26 * 60 + 31);
  });

  it('reads a spelled-out duration', () => {
    expect(parseOcrDuration(SAMSUNG_HEALTH)).toBe(45 * 60);
  });

  it('rejects a duration longer than eight hours as a misread', () => {
    expect(parseOcrDuration('Total Time 12:30:00')).toBeUndefined();
  });

  it('returns undefined when there is no time at all', () => {
    expect(parseOcrDuration('Just a selfie caption')).toBeUndefined();
  });
});

describe('Apple Fitness summary', () => {
  const parsed = parseWorkoutOcrText(APPLE_FITNESS);

  it('separates active from total calories', () => {
    expect(parsed.activeEnergyKcal).toBe(312);
    expect(parsed.totalEnergyKcal).toBe(385);
  });

  it('reads average heart rate', () => {
    expect(parsed.avgHrBpm).toBe(108);
  });

  it('leaves distance and max HR unset rather than guessing', () => {
    expect(parsed.distanceMeters).toBeUndefined();
    expect(parsed.maxHrBpm).toBeUndefined();
  });

  it('labels the activity', () => {
    expect(parsed.activityLabel).toBe('Strength Training');
  });
});

describe('distance-carrying screens', () => {
  it('converts miles to metres', () => {
    const parsed = parseWorkoutOcrText(APPLE_OUTDOOR_RUN);
    expect(parsed.distanceMeters).toBe(Math.round(3.2 * METERS_PER_MILE));
    expect(parsed.avgHrBpm).toBe(152);
    expect(parsed.maxHrBpm).toBe(171);
    expect(parsed.activityLabel).toBe('Run');
  });

  it('converts kilometres to metres', () => {
    const parsed = parseWorkoutOcrText(STRAVA);
    expect(parsed.distanceMeters).toBe(5020);
  });
});

describe('body metrics are never read as workout stats', () => {
  const parsed = parseWorkoutOcrText(SAMSUNG_HEALTH);

  it('ignores weight and BMI lines', () => {
    expect(parsed.activeEnergyKcal).toBe(410);
    expect(parsed.avgHrBpm).toBe(139);
    // 168 lb and BMI 24.1 must not land anywhere.
    expect(parsed.maxHrBpm).toBeUndefined();
    expect(parsed.distanceMeters).toBeUndefined();
  });
});

describe('confidence', () => {
  it('reports the fraction of headline fields found', () => {
    // duration + active cal + avg HR + max HR + distance = 5 of 5
    expect(parseWorkoutOcrText(APPLE_OUTDOOR_RUN).confidence).toBe(1);
  });

  it('is low for a screen with almost nothing on it', () => {
    expect(parseWorkoutOcrText('BPM').confidence).toBeLessThan(0.3);
  });
});

describe('classifier', () => {
  it('accepts a real workout summary', () => {
    expect(classifyWorkoutScreen(APPLE_FITNESS).isWorkoutScreen).toBe(true);
  });

  it('rejects a selfie with no readable text', () => {
    const result = classifyWorkoutScreen('');
    expect(result.isWorkoutScreen).toBe(false);
    expect(result.reason).toBe('no_text');
  });

  it('rejects an unrelated photo that happened to contain a word', () => {
    const result = classifyWorkoutScreen('Happy birthday Courtney!!');
    expect(result.isWorkoutScreen).toBe(false);
    expect(result.reason).toBe('not_a_workout_screen');
  });
});

describe('editor clamps', () => {
  it('clamps heart rate into a survivable range', () => {
    expect(clampOcrField('avgHrBpm', 900)).toBe(230);
    expect(clampOcrField('avgHrBpm', 2)).toBe(30);
  });

  it('clamps calories', () => {
    expect(clampOcrField('activeEnergyKcal', 99999)).toBe(5000);
  });

  it('clamps duration to eight hours', () => {
    expect(clampOcrField('durationSec', 99 * 3600)).toBe(8 * 3600);
  });

  it('clamps distance per unit and returns metres', () => {
    expect(clampOcrDistance(500, 'mi')).toBe(Math.round(300 * METERS_PER_MILE));
    expect(clampOcrDistance(900, 'km')).toBe(500 * 1000);
  });
});

describe('hasOcrNumbers', () => {
  it('is false when nothing was read, so the UI shows no chips', () => {
    expect(hasOcrNumbers(parseWorkoutOcrText('a photo of a dog'))).toBe(false);
  });

  it('is true once any headline field exists', () => {
    expect(hasOcrNumbers(parseWorkoutOcrText(APPLE_FITNESS))).toBe(true);
  });
});
