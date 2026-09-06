import { describe, expect, it } from 'vitest';

import {
  addExercise,
  addTimedRow,
  canMoveExercise,
  duplicateExercise,
  moveExercise,
  newSessionDraft,
  swapExercise,
} from '@/lib/lift/session';
import type { LiftSessionDraft } from '@/lib/lift/types';

function pushSession(): LiftSessionDraft {
  let draft = newSessionDraft({ muscleKeys: ['chest', 'triceps'], unit: 'lb' });
  draft = addExercise(draft, {
    exerciseId: 'incline-bb-bench-press',
    name: 'Incline BB Bench Press',
    muscleKey: 'chest',
  });
  draft = addExercise(draft, {
    exerciseId: 'cable-fly',
    name: 'Cable Fly',
    muscleKey: 'chest',
  });
  draft = addExercise(draft, {
    exerciseId: 'db-triceps-extension',
    name: 'DB Triceps Extension',
    muscleKey: 'triceps',
  });
  return draft;
}

function withNumbers(draft: LiftSessionDraft, key: string): LiftSessionDraft {
  return {
    ...draft,
    exercises: draft.exercises.map((row) =>
      row.key === key
        ? { ...row, sets: row.sets.map((set) => ({ ...set, weight: 135, reps: 8, completedAt: '2026-09-06T10:00:00Z' })) }
        : row,
    ),
  };
}

describe('duplicateExercise', () => {
  it('keeps the numbers, which is the reason to duplicate at all', () => {
    const base = pushSession();
    const incline = base.exercises[0];
    const draft = duplicateExercise(withNumbers(base, incline.key), incline.key);
    const copy = draft.exercises[1];

    expect(copy.name).toBe('Incline BB Bench Press');
    expect(copy.sets.map((set) => [set.weight, set.reps])).toEqual(
      draft.exercises[0].sets.map((set) => [set.weight, set.reps]),
    );
  });

  it('lands directly under the original rather than at the end', () => {
    const base = pushSession();
    const draft = duplicateExercise(base, base.exercises[0].key);
    expect(draft.exercises.map((row) => row.name)).toEqual([
      'Incline BB Bench Press',
      'Incline BB Bench Press',
      'Cable Fly',
      'DB Triceps Extension',
    ]);
  });

  // The copy is work still owed, so it must not arrive pre-ticked.
  it('does not carry the completed ticks across', () => {
    const base = pushSession();
    const incline = base.exercises[0];
    const draft = duplicateExercise(withNumbers(base, incline.key), incline.key);
    expect(draft.exercises[1].sets.every((set) => set.completedAt == null)).toBe(true);
  });

  it('gives the copy its own keys, so editing one does not edit the other', () => {
    const base = pushSession();
    const draft = duplicateExercise(base, base.exercises[0].key);
    expect(draft.exercises[1].key).not.toBe(draft.exercises[0].key);
    expect(draft.exercises[1].sets[0].key).not.toBe(draft.exercises[0].sets[0].key);
  });

  it('copies a cardio row so it can be dropped between sets again', () => {
    let draft = addTimedRow(pushSession(), {
      kind: 'cardio',
      muscleKey: 'chest',
      name: 'Air Bike',
      cardioMethod: 'air_bike',
      cardioType: 'sprint',
      durationSeconds: 30,
      intensity: 8,
    });
    const cardio = draft.exercises.find((row) => row.kind === 'cardio')!;
    draft = duplicateExercise(draft, cardio.key);
    const copies = draft.exercises.filter((row) => row.kind === 'cardio');

    expect(copies).toHaveLength(2);
    expect(copies[1].durationSeconds).toBe(30);
    expect(copies[1].intensity).toBe(8);
    expect(copies[1].key).not.toBe(copies[0].key);
  });
});

describe('swapExercise', () => {
  it('changes the movement and keeps every set', () => {
    const base = pushSession();
    const incline = base.exercises[0];
    const draft = swapExercise(withNumbers(base, incline.key), incline.key, {
      exerciseId: 'flat-bb-bench-press',
      name: 'Flat BB Bench Press',
    });

    expect(draft.exercises[0].name).toBe('Flat BB Bench Press');
    expect(draft.exercises[0].exerciseId).toBe('flat-bb-bench-press');
    expect(draft.exercises[0].sets.map((set) => [set.weight, set.reps])).toEqual(
      incline.sets.map(() => [135, 8]),
    );
  });

  it('leaves the rest of the session alone', () => {
    const base = pushSession();
    const draft = swapExercise(base, base.exercises[0].key, {
      exerciseId: 'flat-bb-bench-press',
      name: 'Flat BB Bench Press',
    });
    expect(draft.exercises.map((row) => row.name).slice(1)).toEqual([
      'Cable Fly',
      'DB Triceps Extension',
    ]);
  });
});

describe('moveExercise', () => {
  it('reorders within the section', () => {
    const base = pushSession();
    const draft = moveExercise(base, base.exercises[1].key, -1);
    expect(draft.exercises.map((row) => row.name)).toEqual([
      'Cable Fly',
      'Incline BB Bench Press',
      'DB Triceps Extension',
    ]);
  });

  // Chest's last exercise has nowhere to go, even though a triceps row sits below it in the list.
  it('will not push a row out of its own muscle group', () => {
    const base = pushSession();
    const lastChest = base.exercises[1];
    expect(canMoveExercise(base, lastChest.key, 1)).toBe(false);
    expect(moveExercise(base, lastChest.key, 1)).toEqual(base);
  });

  it('knows when there is nowhere to go', () => {
    const base = pushSession();
    expect(canMoveExercise(base, base.exercises[0].key, -1)).toBe(false);
    expect(canMoveExercise(base, base.exercises[0].key, 1)).toBe(true);
  });

  it('moves a rest row up between sets', () => {
    let draft = addTimedRow(pushSession(), {
      kind: 'rest',
      muscleKey: 'chest',
      durationSeconds: 60,
    });
    const rest = draft.exercises.find((row) => row.kind === 'rest')!;
    draft = moveExercise(draft, rest.key, -1);
    expect(draft.exercises.map((row) => row.name || 'Rest').slice(0, 3)).toEqual([
      'Incline BB Bench Press',
      'Rest',
      'Cable Fly',
    ]);
  });
});
