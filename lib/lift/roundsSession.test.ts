import { describe, expect, it } from 'vitest';

import { applyOverload } from '@/lib/lift/overload';
import { hasShareableWork, sessionCardioSeconds } from '@/lib/lift/recap';
import { cardioRowSeconds, tabataTemplate } from '@/lib/lift/rounds';
import {
  addExercise,
  addTimedRow,
  copySession,
  draftToPayload,
  newSessionDraft,
  sessionPreview,
  timedRowSummary,
  updateTimedRow,
} from '@/lib/lift/session';
import type { LiftSessionDraft } from '@/lib/lift/types';

/** An Air Bike on its own, ready to be switched between cardio types. */
function bikeSession(cardioType: 'interval' | 'sprint' | 'warmup' = 'interval'): LiftSessionDraft {
  return addTimedRow(newSessionDraft({ muscleKeys: ['cardio'], unit: 'lb' }), {
    kind: 'cardio',
    muscleKey: 'cardio',
    name: 'Air Bike',
    cardioMethod: 'air_bike',
    cardioType,
    durationSeconds: cardioType === 'interval' ? 0 : 120,
  });
}

const cardioRow = (draft: LiftSessionDraft) => draft.exercises[0];

describe('adding a cardio row', () => {
  it('arrives as a Tabata when Interval is chosen up front', () => {
    expect(cardioRow(bikeSession('interval')).rounds).toHaveLength(16);
  });

  it('has no rounds for a single-block type', () => {
    expect(cardioRow(bikeSession('sprint')).rounds).toEqual([]);
  });
});

describe('switching cardio type', () => {
  it('fills in a Tabata on the way into Interval', () => {
    const draft = bikeSession('sprint');
    const next = updateTimedRow(draft, cardioRow(draft).key, { cardioType: 'interval' });
    expect(cardioRow(next).rounds).toHaveLength(16);
  });

  // Overwriting hand-built rounds because someone re-tapped the chip would be destructive.
  it('leaves rounds someone already built alone', () => {
    const draft = bikeSession('sprint');
    const built = updateTimedRow(draft, cardioRow(draft).key, {
      rounds: [{ kind: 'on', minutes: 0, seconds: 45, intensity: 9 }],
    });
    const next = updateTimedRow(built, cardioRow(built).key, { cardioType: 'interval' });
    expect(cardioRow(next).rounds).toHaveLength(1);
    expect(cardioRow(next).rounds?.[0].seconds).toBe(45);
  });

  it('keeps the rounds when switching back out, so the change is reversible', () => {
    const draft = bikeSession('interval');
    const next = updateTimedRow(draft, cardioRow(draft).key, { cardioType: 'steady' });
    expect(cardioRow(next).rounds).toHaveLength(16);
  });
});

describe('cardioRowSeconds', () => {
  it('sums the rounds for an interval, which has no single duration', () => {
    expect(cardioRowSeconds(cardioRow(bikeSession('interval')))).toBe(240);
  });

  it('is the block itself for a single-block type', () => {
    expect(cardioRowSeconds(cardioRow(bikeSession('sprint')))).toBe(120);
  });

  it('adds appended rounds onto a single block', () => {
    const draft = bikeSession('warmup');
    const next = updateTimedRow(draft, cardioRow(draft).key, {
      rounds: [{ kind: 'on', minutes: 0, seconds: 30, intensity: 8 }],
    });
    expect(cardioRowSeconds(cardioRow(next))).toBe(150);
  });
});

describe('summarising an interval row', () => {
  // The bug this guards: an interval leaves durationSeconds at 0, so anything reading that field
  // reports a four minute Tabata as 0:00.
  it('counts toward the session cardio total', () => {
    expect(sessionCardioSeconds(bikeSession('interval'))).toBe(240);
  });

  it('is shareable on its own', () => {
    expect(hasShareableWork(bikeSession('interval'))).toBe(true);
  });

  it('reads as rounds and total time', () => {
    expect(timedRowSummary(cardioRow(bikeSession('interval')))).toBe(
      'Air Bike · Interval · 16 rounds · 4:00',
    );
  });

  it('reads as one clock when it is a single block', () => {
    expect(timedRowSummary(cardioRow(bikeSession('sprint')))).toBe(
      'Air Bike · Sprint · 2:00 · 5/10',
    );
  });

  it('shows rounds on a history preview line', () => {
    const [line] = sessionPreview(bikeSession('interval').exercises, 1);
    expect(line).toBe('Air Bike · 16 rounds · 4:00');
  });

  // Switching a 10:00 steady row to Interval leaves its old duration behind. Counting both would
  // report a four minute Tabata as 14:00.
  it('ignores a leftover duration on an interval row', () => {
    const draft = bikeSession('sprint');
    const next = updateTimedRow(draft, cardioRow(draft).key, { cardioType: 'interval' });
    expect(cardioRow(next).durationSeconds).toBe(120);
    expect(cardioRowSeconds(cardioRow(next))).toBe(240);
    expect(sessionPreview(next.exercises, 1)[0]).toBe('Air Bike · 16 rounds · 4:00');
  });

  it('counts the block and the extra rounds when the type is not Interval', () => {
    const draft = bikeSession('warmup');
    const next = updateTimedRow(draft, cardioRow(draft).key, {
      rounds: [{ kind: 'on', minutes: 0, seconds: 30, intensity: 8 }],
    });
    expect(sessionPreview(next.exercises, 1)[0]).toBe('Air Bike · 1 round · 2:30');
  });
});

describe('saving', () => {
  it('sends the rounds with the row', () => {
    const [row] = draftToPayload(bikeSession('interval'));
    expect(row.rounds).toHaveLength(16);
    expect(row.rounds[0]).toEqual({ kind: 'on', minutes: 0, seconds: 20, intensity: 8 });
  });

  it('sends no rounds for a strength row', () => {
    const draft = addExercise(newSessionDraft({ muscleKeys: ['chest'], unit: 'lb' }), {
      exerciseId: 'flat-bb-bench-press',
      name: 'Flat BB Bench Press',
      muscleKey: 'chest',
    });
    expect(draftToPayload(draft)[0].rounds).toEqual([]);
  });
});

describe('copy on share', () => {
  it('carries the rounds onto the recipient copy', () => {
    const copy = copySession(bikeSession('interval'), { keepNumbers: false });
    expect(cardioRow(copy).rounds).toHaveLength(16);
    expect(cardioRow(copy).rounds?.[0]).toEqual({
      kind: 'on',
      minutes: 0,
      seconds: 20,
      intensity: 8,
    });
  });

  // The sender's rows stay frozen, so the two sessions must not share round objects.
  it('gives the copy its own round objects', () => {
    const source = bikeSession('interval');
    const copy = copySession(source, { keepNumbers: true });
    expect(cardioRow(copy).rounds?.[0]).not.toBe(cardioRow(source).rounds?.[0]);
  });
});

describe('overload', () => {
  it('leaves interval rounds untouched', () => {
    const draft = addExercise(bikeSession('interval'), {
      exerciseId: 'flat-bb-bench-press',
      name: 'Flat BB Bench Press',
      muscleKey: 'chest',
    });
    const bumped = applyOverload(draft, {
      weight: { mode: 'amount', amount: 5 },
      reps: { mode: 'off', amount: 0 },
    });
    const row = bumped.exercises.find((entry) => entry.kind === 'cardio');
    expect(row?.rounds).toEqual(tabataTemplate());
  });
});
