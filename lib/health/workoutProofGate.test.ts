import { describe, expect, it } from 'vitest';

import {
  ELEVATED_HR_NEEDS_AGE,
  ageFromBirthDate,
  elevatedHrThreshold,
  evaluateWorkoutProof,
  proofMinutesFloor,
  stackWorkouts,
  workoutStackSummary,
  type GateWorkout,
} from '@/lib/health/workoutProofGate';

const NOW = new Date('2026-09-05T20:00:00.000Z');
const BASE = Date.parse('2026-09-05T17:00:00.000Z');

/** Minutes after BASE, so the fixtures read like a timeline. */
function at(minute: number): string {
  return new Date(BASE + minute * 60_000).toISOString();
}

function workout(
  id: string,
  options: {
    startMin?: number;
    minutes?: number;
    avgHr?: number | null;
    source?: GateWorkout['source'];
    endedAt?: string | null;
  } = {},
): GateWorkout {
  const startMin = options.startMin ?? 0;
  const minutes = options.minutes ?? 30;
  return {
    id,
    source: options.source ?? 'healthkit',
    startedAt: at(startMin),
    endedAt: options.endedAt === undefined ? at(startMin + minutes) : options.endedAt,
    durationSec: minutes * 60,
    avgHrBpm: options.avgHr ?? null,
  };
}

describe('age from a birth date', () => {
  it('has not counted a birthday that has not happened yet this year', () => {
    expect(ageFromBirthDate('1985-12-25', NOW)).toBe(40);
  });

  it('counts a birthday already passed', () => {
    expect(ageFromBirthDate('1985-01-02', NOW)).toBe(41);
  });

  it('has nothing to say about a missing or unusable date', () => {
    expect(ageFromBirthDate(null, NOW)).toBeNull();
    expect(ageFromBirthDate('', NOW)).toBeNull();
    expect(ageFromBirthDate('not a date', NOW)).toBeNull();
  });

  it('rejects an age that is a typo rather than a person', () => {
    expect(ageFromBirthDate('2025-01-01', NOW)).toBeNull();
    expect(ageFromBirthDate('1850-01-01', NOW)).toBeNull();
  });
});

describe('the elevated heart rate threshold', () => {
  it('uses heart rate reserve when resting heart rate is known', () => {
    // Age 41 → max 179. 60 + 0.40 * (179 - 60) = 107.6 → 108.
    const threshold = elevatedHrThreshold({ birthDate: '1985-01-02', restingHrBpm: 60 }, NOW);
    expect(threshold).toEqual({ kind: 'reserve', bpm: 108, age: 41, restingHrBpm: 60 });
  });

  it('falls back to half of estimated max without a resting rate', () => {
    // Age 41 → max 179. 0.50 * 179 = 89.5 → 90.
    expect(elevatedHrThreshold({ birthDate: '1985-01-02' }, NOW)).toEqual({
      kind: 'estimated-max',
      bpm: 90,
      age: 41,
    });
  });

  it('asks an older person for less, which a flat +30 bpm rule would not', () => {
    const younger = elevatedHrThreshold({ birthDate: '2001-01-02' }, NOW);
    const older = elevatedHrThreshold({ birthDate: '1961-01-02' }, NOW);
    expect(younger.kind).toBe('estimated-max');
    expect(older.kind).toBe('estimated-max');
    if (younger.kind !== 'unknown-age' && older.kind !== 'unknown-age') {
      expect(older.bpm).toBeLessThan(younger.bpm);
    }
  });

  it('ignores a resting rate that cannot be real', () => {
    expect(elevatedHrThreshold({ birthDate: '1985-01-02', restingHrBpm: 400 }, NOW).kind).toBe(
      'estimated-max',
    );
    expect(elevatedHrThreshold({ birthDate: '1985-01-02', restingHrBpm: 0 }, NOW).kind).toBe(
      'estimated-max',
    );
  });

  it('cannot judge intensity without a birth date', () => {
    expect(elevatedHrThreshold({ restingHrBpm: 60 }, NOW)).toEqual({ kind: 'unknown-age' });
  });
});

describe('stacking consecutive sessions', () => {
  it('joins two sessions eight minutes apart', () => {
    const stack = stackWorkouts([
      workout('lift', { startMin: 0, minutes: 18 }),
      workout('pickleball', { startMin: 26, minutes: 30 }),
    ]);
    expect(stack.chain.map((row) => row.id)).toEqual(['lift', 'pickleball']);
    expect(stack.durationSec).toBe(48 * 60);
    expect(stack.rejected).toEqual([]);
  });

  /** The gaps are rest, not exercise. A wall-clock span would quietly inflate the total. */
  it('sums stated durations rather than the wall-clock span', () => {
    const stack = stackWorkouts([
      workout('a', { startMin: 0, minutes: 20 }),
      workout('b', { startMin: 29, minutes: 20 }),
    ]);
    expect(stack.durationSec).toBe(40 * 60);
    // The span from first start to last end is 49 minutes, which is not the answer.
    expect(stack.durationSec).not.toBe(49 * 60);
  });

  it('sorts out of order input by start time', () => {
    const stack = stackWorkouts([
      workout('second', { startMin: 26, minutes: 30 }),
      workout('first', { startMin: 0, minutes: 18 }),
    ]);
    expect(stack.chain.map((row) => row.id)).toEqual(['first', 'second']);
  });

  it('drops a session that starts more than ten minutes after the chain ends', () => {
    const stack = stackWorkouts([
      workout('morning', { startMin: 0, minutes: 20 }),
      workout('evening', { startMin: 200, minutes: 20 }),
    ]);
    expect(stack.chain.map((row) => row.id)).toEqual(['morning']);
    expect(stack.rejected).toEqual([{ id: 'evening', reason: 'gap' }]);
    expect(stack.durationSec).toBe(20 * 60);
  });

  it('keeps a session exactly ten minutes out', () => {
    const stack = stackWorkouts([
      workout('a', { startMin: 0, minutes: 20 }),
      workout('b', { startMin: 30, minutes: 20 }),
    ]);
    expect(stack.chain).toHaveLength(2);
  });

  it('drops a session that runs back over one already counted', () => {
    const stack = stackWorkouts([
      workout('watch', { startMin: 0, minutes: 30 }),
      workout('phone-double-count', { startMin: 10, minutes: 30 }),
    ]);
    expect(stack.chain.map((row) => row.id)).toEqual(['watch']);
    expect(stack.rejected).toEqual([{ id: 'phone-double-count', reason: 'overlap' }]);
  });

  it('drops a session with no end, rather than inventing one', () => {
    const stack = stackWorkouts([
      workout('good', { startMin: 0, minutes: 30 }),
      workout('open-ended', { startMin: 31, endedAt: null }),
    ]);
    expect(stack.chain.map((row) => row.id)).toEqual(['good']);
    expect(stack.rejected).toEqual([{ id: 'open-ended', reason: 'no-clock' }]);
  });

  it('has nothing to stack when given nothing', () => {
    expect(stackWorkouts([])).toEqual({ chain: [], durationSec: 0, rejected: [] });
  });
});

describe('the minutes floor', () => {
  it('is thirty minutes by default', () => {
    expect(proofMinutesFloor(null)).toBe(30);
    expect(proofMinutesFloor(undefined)).toBe(30);
    expect(proofMinutesFloor(0)).toBe(30);
  });

  it('respects a challenge that asks for more', () => {
    expect(proofMinutesFloor(45)).toBe(45);
  });

  it('does not let a challenge ask for less than the product floor', () => {
    expect(proofMinutesFloor(10)).toBe(30);
  });
});

describe('the proof gate', () => {
  it('passes a single thirty minute vendor workout', () => {
    const result = evaluateWorkoutProof({
      workouts: [workout('run', { minutes: 30 })],
      rules: { minMinutes: 30 },
      now: NOW,
    });
    expect(result.ok).toBe(true);
    expect(result.reason).toBeNull();
    expect(result.countedIds).toEqual(['run']);
  });

  /** The feed accepts this happily; proof does not. */
  it('refuses a twenty minute walk on its own', () => {
    const result = evaluateWorkoutProof({
      workouts: [workout('walk', { minutes: 20 })],
      rules: { minMinutes: 30 },
      now: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('20 of 30 min');
  });

  it('refuses a screenshot read however long it claims to be', () => {
    const result = evaluateWorkoutProof({
      workouts: [workout('screenshot', { minutes: 60, source: 'ocr' })],
      rules: { minMinutes: 30 },
      now: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('Attach a Watch or Health workout to use this as proof');
    expect(result.rejected).toEqual([{ id: 'screenshot', reason: 'source' }]);
  });

  it('refuses a hand-entered session', () => {
    const result = evaluateWorkoutProof({
      workouts: [workout('typed', { minutes: 60, source: 'manual' })],
      rules: { minMinutes: 30 },
      now: NOW,
    });
    expect(result.ok).toBe(false);
    expect(result.rejected).toEqual([{ id: 'typed', reason: 'source' }]);
  });

  it('passes an eighteen minute lift stacked with pickleball eight minutes later', () => {
    const result = evaluateWorkoutProof({
      workouts: [
        workout('lift', { startMin: 0, minutes: 18 }),
        workout('pickleball', { startMin: 26, minutes: 30 }),
      ],
      rules: { minMinutes: 30 },
      now: NOW,
    });
    expect(result.ok).toBe(true);
    expect(result.countedSec).toBe(48 * 60);
    expect(result.countedIds).toEqual(['lift', 'pickleball']);
  });

  describe('on an elevated heart rate challenge', () => {
    const hr = { birthDate: '1985-01-02' }; // age 41, so the threshold is 90 bpm
    const rules = { minMinutes: 30, requiresElevatedHr: true };

    it('counts only the segments that reached the threshold', () => {
      const result = evaluateWorkoutProof({
        workouts: [
          workout('lift', { startMin: 0, minutes: 18, avgHr: 84 }),
          workout('pickleball', { startMin: 26, minutes: 32, avgHr: 128 }),
        ],
        rules,
        hr,
        now: NOW,
      });
      expect(result.ok).toBe(true);
      expect(result.countedIds).toEqual(['pickleball']);
      expect(result.countedSec).toBe(32 * 60);
      expect(result.rejected).toEqual([{ id: 'lift', reason: 'hr' }]);
    });

    it('fails when the only intense segment is too short, even though the stack is long', () => {
      const result = evaluateWorkoutProof({
        workouts: [
          workout('lift', { startMin: 0, minutes: 40, avgHr: 70 }),
          workout('sprints', { startMin: 45, minutes: 12, avgHr: 150 }),
        ],
        rules,
        hr,
        now: NOW,
      });
      expect(result.ok).toBe(false);
      expect(result.countedSec).toBe(12 * 60);
      expect(result.reason).toBe('12 of 30 min');
    });

    it('says nothing reached the intensity when no workout did', () => {
      const result = evaluateWorkoutProof({
        workouts: [workout('stroll', { minutes: 40, avgHr: 72 })],
        rules,
        hr,
        now: NOW,
      });
      expect(result.ok).toBe(false);
      expect(result.reason).toBe('No workout reached the intensity for 30 min');
    });

    it('treats a workout with no heart rate as not qualifying', () => {
      const result = evaluateWorkoutProof({
        workouts: [workout('no-hr', { minutes: 40, avgHr: null })],
        rules,
        hr,
        now: NOW,
      });
      expect(result.ok).toBe(false);
      expect(result.rejected).toEqual([{ id: 'no-hr', reason: 'hr' }]);
    });

    /**
     * Almost no member has filled in a birth year, so refusing them would empty out heart rate
     * challenges. Without an age the bar drops to "this workout recorded a heart rate" and the birth
     * year is asked for alongside, not instead.
     */
    it('still counts the workout without a birth year, and asks for one', () => {
      const result = evaluateWorkoutProof({
        workouts: [workout('run', { minutes: 40, avgHr: 150 })],
        rules,
        hr: {},
        now: NOW,
      });
      expect(result.ok).toBe(true);
      expect(result.reason).toBeNull();
      expect(result.nudge).toBe(ELEVATED_HR_NEEDS_AGE);
      expect(result.threshold).toEqual({ kind: 'unknown-age' });
    });

    it('without a birth year still refuses a workout that recorded no heart rate at all', () => {
      const result = evaluateWorkoutProof({
        workouts: [workout('no-hr', { minutes: 40, avgHr: null })],
        rules,
        hr: {},
        now: NOW,
      });
      expect(result.ok).toBe(false);
      expect(result.rejected).toEqual([{ id: 'no-hr', reason: 'hr' }]);
    });

    it('says nothing about a birth year once one is known', () => {
      const result = evaluateWorkoutProof({
        workouts: [workout('run', { minutes: 40, avgHr: 150 })],
        rules,
        hr,
        now: NOW,
      });
      expect(result.ok).toBe(true);
      expect(result.nudge).toBeNull();
    });

    it('uses the personal reserve threshold when resting heart rate is known', () => {
      // Threshold becomes 108, so a 100 bpm average that would pass the age-only rule now fails.
      const result = evaluateWorkoutProof({
        workouts: [workout('tempo', { minutes: 40, avgHr: 100 })],
        rules,
        hr: { birthDate: '1985-01-02', restingHrBpm: 60 },
        now: NOW,
      });
      expect(result.ok).toBe(false);
      expect(result.threshold).toMatchObject({ kind: 'reserve', bpm: 108 });
    });

    it('cannot be cleared by a screenshot, which is the official-challenge rule', () => {
      const result = evaluateWorkoutProof({
        workouts: [workout('shot', { minutes: 60, avgHr: 160, source: 'ocr' })],
        rules,
        hr,
        now: NOW,
      });
      expect(result.ok).toBe(false);
      expect(result.rejected).toEqual([{ id: 'shot', reason: 'source' }]);
    });
  });

  it('reports the required minutes a challenge asked for', () => {
    const result = evaluateWorkoutProof({
      workouts: [workout('run', { minutes: 40 })],
      rules: { minMinutes: 45 },
      now: NOW,
    });
    expect(result.requiredSec).toBe(45 * 60);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('40 of 45 min');
  });

  it('has nothing to pass when nothing was selected', () => {
    const result = evaluateWorkoutProof({ workouts: [], rules: {}, now: NOW });
    expect(result.ok).toBe(false);
    expect(result.countedIds).toEqual([]);
  });
});

describe('the stack summary line', () => {
  it('names the workout count only when there is more than one', () => {
    expect(workoutStackSummary(48 * 60, 2)).toBe('48 min · 2 workouts');
    expect(workoutStackSummary(30 * 60, 1)).toBe('30 min');
  });
});
