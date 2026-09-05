import { describe, expect, it } from 'vitest';

import {
  applyOverload,
  canOverloadSession,
  isOverloadActive,
  nextReps,
  nextWeight,
  overloadChipLabel,
  parseOverloadSummary,
  previewLine,
  previewSet,
} from '@/lib/lift/overload';
import { newSessionDraft } from '@/lib/lift/session';
import type { LiftSessionDraft } from '@/lib/lift/types';

function session(overrides?: Partial<LiftSessionDraft>): LiftSessionDraft {
  return {
    ...newSessionDraft({ muscleKeys: ['chest'], unit: 'lb' }),
    exercises: [
      {
        key: 'ex1',
        exerciseId: 'incline-bb-bench',
        customExerciseId: null,
        name: 'Incline BB Bench',
        muscleKey: 'chest',
        supersetGroup: null,
        sets: [
          { key: 'w1', kind: 'warmup', weight: 45, reps: 10, completedAt: null },
          { key: 's1', kind: 'work', weight: 50, reps: 10, completedAt: null },
          { key: 's2', kind: 'work', weight: 52.5, reps: 8, completedAt: null },
        ],
      },
    ],
    ...overrides,
  };
}

describe('weight bumps', () => {
  it('adds a flat amount and lands on a loadable plate', () => {
    expect(nextWeight(50, { mode: 'amount', amount: 5 }, 'lb')).toBe(55);
    expect(nextWeight(52.5, { mode: 'amount', amount: 5 }, 'lb')).toBe(57.5);
  });

  it('rounds a percentage to the nearest 2.5 in lb and 1.25 in kg', () => {
    // 52.5 * 1.05 = 55.125, which is not a plate.
    expect(nextWeight(52.5, { mode: 'percent', amount: 5 }, 'lb')).toBe(55);
    expect(nextWeight(60, { mode: 'percent', amount: 2 }, 'kg')).toBe(61.25);
  });

  it('never rounds a bump back down to the weight they already lifted', () => {
    // 100 * 1.01 = 101, which would round to 100 in lb and look like Apply did nothing.
    expect(nextWeight(100, { mode: 'percent', amount: 1 }, 'lb')).toBe(102.5);
  });

  it('leaves an empty or bodyweight set alone', () => {
    expect(nextWeight(null, { mode: 'amount', amount: 5 }, 'lb')).toBeNull();
    expect(nextWeight(0, { mode: 'percent', amount: 10 }, 'lb')).toBe(0);
  });

  it('does nothing when the field is off', () => {
    expect(nextWeight(50, { mode: 'off', amount: 5 }, 'lb')).toBe(50);
    expect(nextWeight(50, { mode: 'amount', amount: 0 }, 'lb')).toBe(50);
  });
});

describe('rep bumps', () => {
  it('adds whole reps', () => {
    expect(nextReps(10, { mode: 'amount', amount: 1 })).toBe(11);
  });

  it('rounds a percentage to a whole rep you can actually perform', () => {
    expect(nextReps(10, { mode: 'percent', amount: 10 })).toBe(11);
    // 8 * 1.05 = 8.4 would round back to 8, so it moves by one instead.
    expect(nextReps(8, { mode: 'percent', amount: 5 })).toBe(9);
  });

  it('leaves empty and zero-rep sets alone', () => {
    expect(nextReps(null, { mode: 'amount', amount: 2 })).toBeNull();
    expect(nextReps(0, { mode: 'amount', amount: 2 })).toBe(0);
  });
});

describe('preview', () => {
  it('reads as the source arrow the target', () => {
    expect(previewLine(52.5, 55)).toBe('52.5 → 55');
    expect(previewLine(10, 11, 'reps')).toBe('10 → 11 reps');
  });

  it('hides itself when nothing would change', () => {
    expect(previewLine(50, 50)).toBeNull();
    expect(previewLine(null, 55)).toBeNull();
  });

  it('previews against the heaviest working set, not a warm-up', () => {
    expect(previewSet(session())?.weight).toBe(52.5);
  });

  it('falls back to a working set when the session is bodyweight', () => {
    const bodyweight = session({
      exercises: [
        {
          key: 'ex1',
          exerciseId: null,
          customExerciseId: null,
          name: 'Pull-up',
          muscleKey: 'back',
          supersetGroup: null,
          sets: [{ key: 's1', kind: 'work', weight: null, reps: 8, completedAt: null }],
        },
      ],
    });
    expect(previewSet(bodyweight)?.reps).toBe(8);
  });
});

describe('applying a plan', () => {
  it('bumps every working set and leaves warm-ups exactly as they were', () => {
    const next = applyOverload(session(), {
      weight: { mode: 'amount', amount: 5 },
      reps: { mode: 'off', amount: 0 },
    });
    const sets = next.exercises[0].sets;
    expect(sets[0]).toMatchObject({ kind: 'warmup', weight: 45, reps: 10 });
    expect(sets[1]).toMatchObject({ kind: 'work', weight: 55 });
    expect(sets[2]).toMatchObject({ kind: 'work', weight: 57.5 });
  });

  it('starts a genuinely new session and clears the checkmarks', () => {
    const source = session();
    source.exercises[0].sets[1].completedAt = '2026-09-05T19:00:00Z';
    const next = applyOverload(source, {
      weight: { mode: 'amount', amount: 5 },
      reps: { mode: 'off', amount: 0 },
    });
    expect(next.id).not.toBe(source.id);
    expect(next.completedAt).toBeNull();
    expect(next.exercises[0].sets.every((set) => set.completedAt === null)).toBe(true);
  });

  it('keeps superset grouping and running order', () => {
    const source = session({
      exercises: [
        { ...session().exercises[0], key: 'a', supersetGroup: 1 },
        { ...session().exercises[0], key: 'b', name: 'DB Flyes', supersetGroup: 1 },
      ],
    });
    const next = applyOverload(source, {
      weight: { mode: 'amount', amount: 5 },
      reps: { mode: 'off', amount: 0 },
    });
    expect(next.exercises.map((row) => row.supersetGroup)).toEqual([1, 1]);
    expect(next.exercises.map((row) => row.name)).toEqual(['Incline BB Bench', 'DB Flyes']);
  });

  it('records where the bump came from so the card can show it', () => {
    const source = session();
    const next = applyOverload(source, {
      weight: { mode: 'amount', amount: 2.5 },
      reps: { mode: 'amount', amount: 1 },
    });
    expect(next.sourceSessionId).toBe(source.id);
    expect(next.overloadFromSessionId).toBe(source.id);
    expect(next.overloadSummary).toEqual({
      weightDelta: { mode: 'amount', amount: 2.5, unit: 'lb' },
      repsDelta: { mode: 'amount', amount: 1 },
    });
  });

  it('copies without claiming an overload when both fields are off', () => {
    const next = applyOverload(session(), {
      weight: { mode: 'off', amount: 0 },
      reps: { mode: 'off', amount: 0 },
    });
    expect(next.overloadFromSessionId).toBeNull();
    expect(next.overloadSummary).toBeNull();
    expect(next.exercises[0].sets[1].weight).toBe(50);
  });
});

describe('when overload is offered', () => {
  it('is off until at least one field is set', () => {
    expect(isOverloadActive({ weight: { mode: 'off', amount: 0 }, reps: { mode: 'off', amount: 0 } })).toBe(false);
    expect(isOverloadActive({ weight: { mode: 'amount', amount: 5 }, reps: { mode: 'off', amount: 0 } })).toBe(true);
  });

  it('is hidden on a blank session, because there is nothing to bump', () => {
    expect(canOverloadSession(newSessionDraft({ muscleKeys: ['chest'], unit: 'lb' }))).toBe(false);
  });

  it('is offered on a copied session that still has all its sets ahead of it', () => {
    expect(canOverloadSession(session())).toBe(true);
  });

  it('disappears once a working set has been checked off', () => {
    const started = session();
    started.exercises[0].sets[1].completedAt = '2026-09-05T19:00:00Z';
    expect(canOverloadSession(started)).toBe(false);
  });

  it('is hidden on a session that is already saved', () => {
    expect(canOverloadSession(session({ completedAt: '2026-09-05T19:00:00Z' }))).toBe(false);
  });
});

describe('chip label', () => {
  it('prints the bump in plain language', () => {
    expect(
      overloadChipLabel({
        weightDelta: { mode: 'amount', amount: 2.5, unit: 'lb' },
        repsDelta: null,
      }),
    ).toBe('+2.5 lb');
    expect(
      overloadChipLabel({ weightDelta: null, repsDelta: { mode: 'amount', amount: 1 } }),
    ).toBe('+1 rep');
    expect(
      overloadChipLabel({
        weightDelta: { mode: 'percent', amount: 5, unit: 'kg' },
        repsDelta: { mode: 'amount', amount: 2 },
      }),
    ).toBe('+5% weight · +2 reps');
  });

  it('says nothing when there was no bump', () => {
    expect(overloadChipLabel(null)).toBe('');
  });
});

describe('reading the stored summary back', () => {
  it('round-trips what apply wrote', () => {
    const stored = JSON.parse(
      JSON.stringify({
        weightDelta: { mode: 'amount', amount: 5, unit: 'kg' },
        repsDelta: { mode: 'percent', amount: 10 },
      }),
    );
    expect(parseOverloadSummary(stored)).toEqual({
      weightDelta: { mode: 'amount', amount: 5, unit: 'kg' },
      repsDelta: { mode: 'percent', amount: 10 },
    });
  });

  it('treats junk as no overload rather than throwing', () => {
    expect(parseOverloadSummary(null)).toBeNull();
    expect(parseOverloadSummary('+5')).toBeNull();
    expect(parseOverloadSummary({ weightDelta: { amount: 0 } })).toBeNull();
  });
});
