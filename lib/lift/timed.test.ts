import { describe, expect, it } from 'vitest';

import { applyOverload } from '@/lib/lift/overload';
import { hasShareableWork } from '@/lib/lift/recap';
import {
  addExercise,
  addTimedRow,
  copySession,
  draftToPayload,
  formatDuration,
  joinDuration,
  matchesRest,
  newSessionDraft,
  searchCardioMethods,
  sessionSections,
  splitDuration,
  timedRowLabel,
  timedRowSummary,
  updateTimedRow,
} from '@/lib/lift/session';
import type { LiftSessionDraft } from '@/lib/lift/types';

function chestSession(): LiftSessionDraft {
  const draft = newSessionDraft({ muscleKeys: ['chest', 'triceps'], unit: 'lb' });
  return addExercise(draft, {
    exerciseId: 'flat-bb-bench-press',
    name: 'Flat BB Bench Press',
    muscleKey: 'chest',
  });
}

describe('duration', () => {
  it('reads as a clock, never as raw seconds', () => {
    expect(formatDuration(30)).toBe('0:30');
    expect(formatDuration(60)).toBe('1:00');
    expect(formatDuration(600)).toBe('10:00');
    expect(formatDuration(3661)).toBe('1:01:01');
  });

  it('treats missing and negative time as zero rather than throwing', () => {
    expect(formatDuration(null)).toBe('0:00');
    expect(formatDuration(-5)).toBe('0:00');
  });

  it('rolls seconds over into minutes so a stepper cannot show 0:60', () => {
    expect(joinDuration(0, 60)).toBe(60);
    expect(splitDuration(60)).toEqual({ minutes: 1, seconds: 0 });
    expect(splitDuration(95)).toEqual({ minutes: 1, seconds: 35 });
  });
});

describe('inserting cardio and rest', () => {
  it('drops a rest inside the muscle section it was added from', () => {
    const session = addTimedRow(chestSession(), {
      kind: 'rest',
      muscleKey: 'chest',
      durationSeconds: 45,
    });
    const chest = sessionSections(session).find((section) => section.muscle === 'chest');
    expect(chest?.exercises.map((row) => row.kind)).toEqual(['strength', 'rest']);
  });

  it('builds the interval pattern in the order it was performed', () => {
    let session = chestSession();
    session = addTimedRow(session, { kind: 'rest', muscleKey: 'chest', durationSeconds: 60 });
    session = addTimedRow(session, {
      kind: 'cardio',
      muscleKey: 'chest',
      name: 'Air Bike',
      cardioMethod: 'air-bike',
      cardioType: 'sprint',
      durationSeconds: 30,
      intensity: 8,
    });
    session = addTimedRow(session, { kind: 'rest', muscleKey: 'chest', durationSeconds: 45 });

    const chest = sessionSections(session).find((section) => section.muscle === 'chest');
    expect(chest?.exercises.map((row) => row.kind)).toEqual([
      'strength',
      'rest',
      'cardio',
      'rest',
    ]);
  });

  it('adds Cardio as a section of its own when picked as a group', () => {
    const session = addTimedRow(newSessionDraft({ muscleKeys: ['cardio'], unit: 'lb' }), {
      kind: 'cardio',
      muscleKey: 'cardio',
      name: 'Treadmill',
      cardioMethod: 'treadmill',
      cardioType: 'cooldown',
      durationSeconds: 600,
      intensity: 3,
    });
    expect(sessionSections(session).map((section) => section.muscle)).toEqual(['cardio']);
    expect(timedRowSummary(session.exercises[0])).toBe('Treadmill · Cool down · 10:00 · 3/10');
  });

  it('calls an "other" method by the name its owner gave it', () => {
    const session = addTimedRow(newSessionDraft({ muscleKeys: ['cardio'], unit: 'lb' }), {
      kind: 'cardio',
      muscleKey: 'cardio',
      cardioMethod: 'other',
      cardioCustomName: 'Stair sprints at the park',
      durationSeconds: 300,
    });
    expect(timedRowLabel(session.exercises[0])).toBe('Stair sprints at the park');
  });
});

describe('what the save RPC receives', () => {
  it('sends a timed row with no sets and no catalog id', () => {
    const session = addTimedRow(chestSession(), {
      kind: 'cardio',
      muscleKey: 'chest',
      name: 'Air Bike',
      cardioMethod: 'air-bike',
      cardioType: 'sprint',
      durationSeconds: 30,
      intensity: 8,
    });
    const cardio = draftToPayload(session)[1];
    expect(cardio.kind).toBe('cardio');
    expect(cardio.sets).toEqual([]);
    expect(cardio.exerciseId).toBeNull();
    expect(cardio.durationSeconds).toBe(30);
    expect(cardio.intensity).toBe(8);
  });

  it('never sends intensity or a method on a rest', () => {
    const session = addTimedRow(chestSession(), {
      kind: 'rest',
      muscleKey: 'chest',
      durationSeconds: 45,
    });
    const rest = draftToPayload(session)[1];
    expect(rest.durationSeconds).toBe(45);
    expect(rest.intensity).toBeNull();
    expect(rest.cardioMethod).toBeNull();
    expect(rest.cardioType).toBeNull();
  });
});

describe('overload leaves timed rows alone', () => {
  it('bumps the bench and not the sprint or the rest', () => {
    let session = chestSession();
    session = updateTimedRow(session, session.exercises[0].key, {});
    session.exercises[0].sets[0] = {
      ...session.exercises[0].sets[0],
      weight: 100,
      reps: 10,
    };
    session = addTimedRow(session, {
      kind: 'cardio',
      muscleKey: 'chest',
      name: 'Air Bike',
      cardioMethod: 'air-bike',
      cardioType: 'sprint',
      durationSeconds: 30,
      intensity: 8,
    });
    session = addTimedRow(session, { kind: 'rest', muscleKey: 'chest', durationSeconds: 45 });

    const bumped = applyOverload(session, {
      weight: { mode: 'amount', amount: 5 },
      reps: { mode: 'off', amount: 0 },
    });

    expect(bumped.exercises[0].sets[0].weight).toBe(105);
    expect(bumped.exercises[1].durationSeconds).toBe(30);
    expect(bumped.exercises[1].intensity).toBe(8);
    expect(bumped.exercises[2].durationSeconds).toBe(45);
  });
});

describe('copying a session', () => {
  it('keeps the shape of the intervals even when the weights are cleared', () => {
    let session = chestSession();
    session = addTimedRow(session, {
      kind: 'cardio',
      muscleKey: 'chest',
      name: 'Air Bike',
      cardioMethod: 'air-bike',
      cardioType: 'sprint',
      durationSeconds: 30,
      intensity: 8,
    });

    const copy = copySession(session, { numbers: 'empty' });
    expect(copy.exercises[1].kind).toBe('cardio');
    expect(copy.exercises[1].durationSeconds).toBe(30);
    expect(copy.exercises[1].cardioMethod).toBe('air-bike');
    // Their loads do not come across, but the workout's structure does.
    expect(copy.exercises[0].sets[0].weight).toBeNull();
  });
});

describe('what can be shared', () => {
  it('lets a cardio-only session onto a card', () => {
    const session = addTimedRow(newSessionDraft({ muscleKeys: ['cardio'], unit: 'lb' }), {
      kind: 'cardio',
      muscleKey: 'cardio',
      name: 'Row Machine',
      cardioMethod: 'row-machine',
      durationSeconds: 1200,
    });
    expect(hasShareableWork(session)).toBe(true);
  });

  it('does not treat a rest as a workout', () => {
    const session = addTimedRow(newSessionDraft({ muscleKeys: ['rest'], unit: 'lb' }), {
      kind: 'rest',
      muscleKey: 'rest',
      durationSeconds: 300,
    });
    expect(hasShareableWork(session)).toBe(false);
  });
});

describe('finding cardio from the exercise search', () => {
  const methods = [
    { id: 'treadmill', name: 'Treadmill' },
    { id: 'trail_run', name: 'Trail Run' },
    { id: 'air_bike', name: 'Air Bike' },
    { id: 'outdoor_bike', name: 'Outdoor Bike' },
    { id: 'row_machine', name: 'Row Machine' },
  ];

  it('finds a machine the strength catalog does not have', () => {
    expect(searchCardioMethods(methods, 'tread').map((m) => m.id)).toEqual(['treadmill']);
  });

  // Someone typing "bike" means the bikes, so a name that starts with it comes before one that
  // merely contains it.
  it('puts a leading match above a mid-name match', () => {
    expect(searchCardioMethods(methods, 'bike').map((m) => m.id)).toEqual([
      'air_bike',
      'outdoor_bike',
    ]);
  });

  it('lists the catalog when they just type cardio', () => {
    expect(searchCardioMethods(methods, 'cardio')).toHaveLength(5);
  });

  it('stays quiet for a strength search', () => {
    expect(searchCardioMethods(methods, 'bench press')).toEqual([]);
    expect(searchCardioMethods(methods, '')).toEqual([]);
  });

  it('offers rest once they have typed enough to mean it', () => {
    expect(matchesRest('re')).toBe(true);
    expect(matchesRest('rest')).toBe(true);
    expect(matchesRest('r')).toBe(false);
    expect(matchesRest('reverse fly')).toBe(false);
  });
});
