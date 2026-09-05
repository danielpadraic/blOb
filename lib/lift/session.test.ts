import { describe, expect, it } from 'vitest';

import {
  addExercise,
  addSet,
  clampRepsInput,
  clampWeightInput,
  countWorkSets,
  draftToPayload,
  formatLiftNumber,
  isEmptySet,
  newSessionDraft,
  removeExercise,
  removeSet,
  renameSession,
  repeatSession,
  rowsToDraft,
  sessionPreview,
  sessionSections,
  sessionTitle,
  setLabel,
  stepReps,
  stepWeight,
  supersetLabels,
  supersetPartner,
  toggleSetComplete,
  updateSet,
} from '@/lib/lift/session';
import type { LiftSessionDraft } from '@/lib/lift/types';

function chestAndTriceps(): LiftSessionDraft {
  return newSessionDraft({
    muscleKeys: ['chest', 'triceps'],
    unit: 'lb',
    performedAt: '2026-09-05T17:00:00.000Z',
  });
}

function withBench(): LiftSessionDraft {
  return addExercise(chestAndTriceps(), {
    exerciseId: 'incline-bb-bench-press',
    name: 'Incline BB Bench Press',
    muscleKey: 'chest',
  });
}

describe('steppers', () => {
  it('moves pounds in fives and kilos in 2.5s', () => {
    expect(stepWeight(135, 1, 'lb')).toBe(140);
    expect(stepWeight(135, -1, 'lb')).toBe(130);
    expect(stepWeight(60, 1, 'kg')).toBe(62.5);
    expect(stepWeight(60, -1, 'kg')).toBe(57.5);
  });

  it('steps up from empty and never below zero', () => {
    expect(stepWeight(null, 1, 'lb')).toBe(5);
    expect(stepWeight(null, -1, 'lb')).toBe(0);
    expect(stepWeight(2, -1, 'lb')).toBe(0);
    expect(stepReps(0, -1)).toBe(0);
    expect(stepReps(null, 1)).toBe(1);
  });
});

describe('field clamps', () => {
  it('keeps tenths', () => {
    expect(clampWeightInput('137.5')).toBe(137.5);
    expect(clampRepsInput('8.5')).toBe(8.5);
  });

  it('turns junk into an empty field, not a zero', () => {
    expect(clampWeightInput('')).toBeNull();
    expect(clampWeightInput('abc')).toBeNull();
    expect(clampWeightInput('.')).toBeNull();
    expect(clampRepsInput('  ')).toBeNull();
  });

  it('rescues a number out of sloppy text', () => {
    expect(clampWeightInput(' 135lb ')).toBe(135);
    expect(clampWeightInput('62,5')).toBe(62.5);
  });

  it('holds the extremes inside the column the database accepts', () => {
    expect(clampWeightInput('99999')).toBe(2000);
    expect(clampRepsInput('4000')).toBe(1000);
  });

  it('reads a stray minus as the number they meant, never as a negative', () => {
    expect(clampWeightInput('-40')).toBe(40);
    expect(clampRepsInput('-3')).toBe(3);
  });

  it('prints a whole number without a trailing decimal', () => {
    expect(formatLiftNumber(135)).toBe('135');
    expect(formatLiftNumber(137.5)).toBe('137.5');
    expect(formatLiftNumber(null)).toBe('');
  });
});

describe('sections', () => {
  it('gives every picked muscle a section, even an empty one', () => {
    const sections = sessionSections(chestAndTriceps());
    expect(sections.map((row) => row.muscle)).toEqual(['chest', 'triceps']);
    expect(sections[0].exercises).toEqual([]);
  });

  it('files an exercise under the muscle it was added to', () => {
    const draft = addExercise(withBench(), {
      exerciseId: 'rope-pushdown',
      name: 'Rope Pushdown',
      muscleKey: 'triceps',
    });
    const sections = sessionSections(draft);
    expect(sections[0].exercises.map((row) => row.name)).toEqual(['Incline BB Bench Press']);
    expect(sections[1].exercises.map((row) => row.name)).toEqual(['Rope Pushdown']);
  });

  it('adds a section when an exercise lands on a muscle that was not picked', () => {
    const draft = addExercise(chestAndTriceps(), {
      exerciseId: 'db-lateral-raise',
      name: 'DB Lateral Raise',
      muscleKey: 'shoulders',
    });
    expect(draft.muscleKeys).toContain('shoulders');
    expect(sessionSections(draft).map((row) => row.muscle)).toContain('shoulders');
  });
});

describe('supersets', () => {
  it('pairs a new exercise with the one above it', () => {
    const draft = addExercise(withBench(), {
      exerciseId: 'flat-db-fly',
      name: 'Flat DB Fly',
      muscleKey: 'chest',
      superset: true,
    });
    const labels = supersetLabels(draft);
    expect(labels[draft.exercises[0].key]).toBe('A1');
    expect(labels[draft.exercises[1].key]).toBe('A2');
    expect(draft.exercises[0].supersetGroup).toBe(draft.exercises[1].supersetGroup);
  });

  it('leaves a solo exercise unlabelled', () => {
    expect(supersetLabels(withBench())).toEqual({});
  });

  it('drops the label when the partner is removed', () => {
    const paired = addExercise(withBench(), {
      exerciseId: 'flat-db-fly',
      name: 'Flat DB Fly',
      muscleKey: 'chest',
      superset: true,
    });
    const alone = removeExercise(paired, paired.exercises[1].key);
    expect(supersetLabels(alone)).toEqual({});
  });

  it('names the partner a superset would attach to', () => {
    expect(supersetPartner(withBench(), 'chest')?.name).toBe('Incline BB Bench Press');
    expect(supersetPartner(withBench(), 'triceps')).toBeNull();
  });
});

describe('sets', () => {
  it('opens a new exercise with one work set', () => {
    const draft = withBench();
    expect(draft.exercises[0].sets).toHaveLength(1);
    expect(draft.exercises[0].sets[0].kind).toBe('work');
  });

  it('keeps warm-ups above the work sets', () => {
    const draft = addSet(withBench(), withBench().exercises[0].key, 'warmup');
    const base = withBench();
    const withWarmup = addSet(base, base.exercises[0].key, 'warmup');
    expect(withWarmup.exercises[0].sets.map((set) => set.kind)).toEqual(['warmup', 'work']);
    expect(draft).toBeDefined();
  });

  it('numbers work sets and marks warm-ups with W', () => {
    let draft = withBench();
    const key = draft.exercises[0].key;
    draft = addSet(draft, key, 'warmup');
    draft = addSet(draft, key, 'work');
    const sets = draft.exercises[0].sets;
    expect(sets.map((_, index) => setLabel(sets, index))).toEqual(['W', '1', '2']);
  });

  it('carries the last numbers into the next set', () => {
    let draft = withBench();
    const key = draft.exercises[0].key;
    draft = updateSet(draft, key, draft.exercises[0].sets[0].key, { weight: 135, reps: 8 });
    draft = addSet(draft, key, 'work');
    expect(draft.exercises[0].sets[1].weight).toBe(135);
    expect(draft.exercises[0].sets[1].reps).toBe(8);
    expect(draft.exercises[0].sets[1].completedAt).toBeNull();
  });

  it('completes and un-completes with one tap', () => {
    const base = withBench();
    const key = base.exercises[0].key;
    const setKey = base.exercises[0].sets[0].key;
    const done = toggleSetComplete(base, key, setKey, '2026-09-05T18:00:00.000Z');
    expect(done.exercises[0].sets[0].completedAt).toBe('2026-09-05T18:00:00.000Z');
    expect(toggleSetComplete(done, key, setKey).exercises[0].sets[0].completedAt).toBeNull();
  });

  it('only calls a set empty when there is nothing in it', () => {
    const base = withBench();
    expect(isEmptySet(base.exercises[0].sets[0])).toBe(true);
    const filled = updateSet(base, base.exercises[0].key, base.exercises[0].sets[0].key, {
      reps: 5,
    });
    expect(isEmptySet(filled.exercises[0].sets[0])).toBe(false);
  });

  it('removes a set', () => {
    let draft = withBench();
    const key = draft.exercises[0].key;
    draft = addSet(draft, key, 'work');
    draft = removeSet(draft, key, draft.exercises[0].sets[1].key);
    expect(draft.exercises[0].sets).toHaveLength(1);
  });
});

describe('titles', () => {
  it('titles an unnamed session from its muscles and date', () => {
    expect(sessionTitle(chestAndTriceps())).toMatch(/^Chest · Triceps · [A-Z][a-z]{2} \d{1,2}$/);
  });

  it('uses the name once they rename it', () => {
    expect(sessionTitle(renameSession(chestAndTriceps(), '  Push day  '))).toBe('Push day');
  });

  it('falls back to the auto title when the name is cleared', () => {
    const cleared = renameSession(renameSession(chestAndTriceps(), 'Push day'), '   ');
    expect(cleared.title).toBeNull();
    expect(sessionTitle(cleared)).toContain('Chest');
  });

  it('previews two lines and counts the rest', () => {
    const preview = sessionPreview([
      { name: 'Incline BB Bench Press', sets: [{ kind: 'work' }, { kind: 'work' }] },
      { name: 'Flat DB Fly', sets: [{ kind: 'work' }] },
      { name: 'Rope Pushdown', sets: [{ kind: 'work' }] },
    ]);
    expect(preview).toEqual(['Incline BB Bench Press · 2 sets', 'Flat DB Fly · 1 set · +1 more']);
  });
});

describe('the save payload', () => {
  it('numbers exercises and sets in running order', () => {
    let draft = withBench();
    const key = draft.exercises[0].key;
    draft = addSet(draft, key, 'warmup');
    draft = addExercise(draft, {
      exerciseId: 'rope-pushdown',
      name: 'Rope Pushdown',
      muscleKey: 'triceps',
    });

    const payload = draftToPayload(draft);
    expect(payload.map((row) => row.sort)).toEqual([0, 1]);
    expect(payload[0].sets.map((set) => set.sort)).toEqual([0, 1]);
    expect(payload[0].sets.map((set) => set.kind)).toEqual(['warmup', 'work']);
    expect(payload[0].exerciseId).toBe('incline-bb-bench-press');
    expect(payload[0].customExerciseId).toBeNull();
  });

  it('never sends both a catalog id and a custom id', () => {
    const draft = addExercise(chestAndTriceps(), {
      customExerciseId: 'a5f4b1c2-0000-4000-8000-000000000000',
      name: 'Floor press',
      muscleKey: 'chest',
    });
    const [row] = draftToPayload(draft);
    expect(row.exerciseId).toBeNull();
    expect(row.customExerciseId).toBe('a5f4b1c2-0000-4000-8000-000000000000');
  });
});

describe('loading a saved session', () => {
  it('rebuilds the draft in sort order', () => {
    const draft = rowsToDraft(
      {
        id: 'session-1',
        user_id: 'user-1',
        title: null,
        performed_at: '2026-09-05T17:00:00.000Z',
        completed_at: '2026-09-05T18:30:00.000Z',
        muscle_keys: ['triceps', 'chest'],
        unit: 'lb',
        created_at: '2026-09-05T17:00:00.000Z',
        updated_at: '2026-09-05T18:30:00.000Z',
      },
      [
        {
          id: 'ex-2',
          session_id: 'session-1',
          exercise_id: 'rope-pushdown',
          custom_exercise_id: null,
          name: 'Rope Pushdown',
          muscle_key: 'triceps',
          sort: 1,
          superset_group: null,
        },
        {
          id: 'ex-1',
          session_id: 'session-1',
          exercise_id: 'incline-bb-bench-press',
          custom_exercise_id: null,
          name: 'Incline BB Bench Press',
          muscle_key: 'chest',
          sort: 0,
          superset_group: null,
        },
      ],
      [
        {
          id: 'set-2',
          exercise_row_id: 'ex-1',
          kind: 'work',
          sort: 1,
          weight: '135',
          reps: '8',
          completed_at: '2026-09-05T17:20:00.000Z',
        },
        {
          id: 'set-1',
          exercise_row_id: 'ex-1',
          kind: 'warmup',
          sort: 0,
          weight: '45',
          reps: '10',
          completed_at: null,
        },
      ],
    );

    expect(draft.exercises.map((row) => row.name)).toEqual([
      'Incline BB Bench Press',
      'Rope Pushdown',
    ]);
    // Muscle order follows the catalog, not the order the rows came back.
    expect(draft.muscleKeys).toEqual(['chest', 'triceps']);
    expect(draft.exercises[0].sets.map((set) => set.kind)).toEqual(['warmup', 'work']);
    expect(draft.exercises[0].sets[1].weight).toBe(135);
    expect(countWorkSets(draft)).toBe(1);
  });
});

describe('start this again', () => {
  it('copies the structure and the weights but nothing is pre-checked', () => {
    let source = withBench();
    const key = source.exercises[0].key;
    source = updateSet(source, key, source.exercises[0].sets[0].key, { weight: 135, reps: 8 });
    source = toggleSetComplete(source, key, source.exercises[0].sets[0].key);
    source = { ...source, completedAt: '2026-09-05T18:30:00.000Z' };

    const next = repeatSession(source);
    expect(next.id).not.toBe(source.id);
    expect(next.completedAt).toBeNull();
    expect(next.title).toBeNull();
    expect(next.muscleKeys).toEqual(source.muscleKeys);
    expect(next.exercises[0].name).toBe('Incline BB Bench Press');
    expect(next.exercises[0].sets[0].weight).toBe(135);
    expect(next.exercises[0].sets[0].reps).toBe(8);
    expect(next.exercises[0].sets[0].completedAt).toBeNull();
    expect(next.exercises[0].key).not.toBe(source.exercises[0].key);
  });
});
