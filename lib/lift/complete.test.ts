import { describe, expect, it } from 'vitest';

import {
  buildCompletedCard,
  canCompleteSession,
  COMPLETE_LEFTOVER_HINT,
  defaultHistoryTab,
  filterHistoryTab,
  leftoverIncompleteWork,
  sessionWeightMoved,
  toggleRoundComplete,
} from '@/lib/lift/complete';
import { addExercise, addTimedRow, newSessionDraft, toggleSetComplete } from '@/lib/lift/session';
import type { LiftSessionDraft, LiftSetDraft } from '@/lib/lift/types';

const DONE = '2026-09-07T18:00:00.000Z';

function work(weight: number, reps: number, done = false): LiftSetDraft {
  return {
    key: `s-${Math.random()}`,
    kind: 'work',
    weight,
    reps,
    completedAt: done ? DONE : null,
  };
}

function warmup(weight: number, reps: number, done = false): LiftSetDraft {
  return {
    key: `w-${Math.random()}`,
    kind: 'warmup',
    weight,
    reps,
    completedAt: done ? DONE : null,
  };
}

function bench(sets: LiftSetDraft[]): LiftSessionDraft {
  const draft = addExercise(newSessionDraft({ muscleKeys: ['chest'], unit: 'lb' }), {
    exerciseId: 'incline-bb-bench-press',
    name: 'Incline BB Bench Press',
    muscleKey: 'chest',
  });
  return { ...draft, exercises: [{ ...draft.exercises[0], sets }] };
}

describe('complete gate', () => {
  it('blocks Complete when a working set is leftover', () => {
    const draft = bench([work(135, 8, true), work(135, 8, false)]);
    expect(canCompleteSession(draft)).toBe(false);
    expect(leftoverIncompleteWork(draft).sets).toBe(1);
  });

  it('blocks Complete when a warm-up is leftover', () => {
    const draft = bench([warmup(45, 10, false), work(135, 8, true)]);
    expect(canCompleteSession(draft)).toBe(false);
    expect(leftoverIncompleteWork(draft).sets).toBe(1);
  });

  it('allows Complete when every remaining set is Done', () => {
    const draft = bench([warmup(45, 10, true), work(135, 8, true)]);
    expect(canCompleteSession(draft)).toBe(true);
    expect(leftoverIncompleteWork(draft)).toEqual({ sets: 0, rounds: 0 });
  });

  it('allows Complete after the leftover set is removed', () => {
    const draft = bench([work(135, 8, true)]);
    expect(canCompleteSession(draft)).toBe(true);
  });

  it('blocks an empty session', () => {
    expect(canCompleteSession(newSessionDraft({ muscleKeys: ['chest'], unit: 'lb' }))).toBe(false);
  });

  it('explains leftover work in the copy the footer uses', () => {
    expect(COMPLETE_LEFTOVER_HINT).toBe('Check Done or remove leftover sets and rounds.');
  });
});

describe('cardio rounds', () => {
  it('requires Done on a steady main block', () => {
    const draft = addTimedRow(newSessionDraft({ muscleKeys: ['cardio'], unit: 'lb' }), {
      kind: 'cardio',
      muscleKey: 'cardio',
      name: 'Treadmill',
      cardioType: 'steady',
      durationSeconds: 600,
    });
    expect(canCompleteSession(draft)).toBe(false);
    expect(leftoverIncompleteWork(draft).rounds).toBe(1);
    const done = {
      ...draft,
      exercises: [{ ...draft.exercises[0], completedAt: DONE }],
    };
    expect(canCompleteSession(done)).toBe(true);
  });

  it('requires Done on every interval round', () => {
    const draft = addTimedRow(newSessionDraft({ muscleKeys: ['cardio'], unit: 'lb' }), {
      kind: 'cardio',
      muscleKey: 'cardio',
      name: 'Air Bike',
      cardioType: 'interval',
    });
    const row = draft.exercises[0];
    expect((row.rounds ?? []).length).toBeGreaterThan(0);
    expect(canCompleteSession(draft)).toBe(false);

    const checked = {
      ...draft,
      exercises: [
        {
          ...row,
          rounds: (row.rounds ?? []).map((round) => ({ ...round, completedAt: DONE })),
        },
      ],
    };
    expect(canCompleteSession(checked)).toBe(true);
  });

  it('toggles one round without touching the others', () => {
    const rounds = [
      { kind: 'on' as const, minutes: 0, seconds: 20, intensity: 8, completedAt: null },
      { kind: 'off' as const, minutes: 0, seconds: 10, completedAt: null },
    ];
    const next = toggleRoundComplete(rounds, 0, DONE);
    expect(next[0].completedAt).toBe(DONE);
    expect(next[1].completedAt).toBeNull();
  });
});

describe('weight moved', () => {
  it('sums completed working sets only', () => {
    const draft = bench([
      warmup(45, 10, true),
      work(135, 10, true),
      work(135, 8, true),
      work(155, 5, false),
    ]);
    expect(sessionWeightMoved(draft)).toBe(135 * 10 + 135 * 8);
  });

  it('ignores cardio', () => {
    let draft = bench([work(100, 10, true)]);
    draft = addTimedRow(draft, {
      kind: 'cardio',
      muscleKey: 'cardio',
      name: 'Treadmill',
      cardioType: 'steady',
      durationSeconds: 600,
    });
    expect(sessionWeightMoved(draft)).toBe(1000);
  });
});

describe('history tabs', () => {
  const rows = [
    { id: 'a', favorite: true, status: 'open', completedAt: null },
    { id: 'b', favorite: false, status: 'open', completedAt: null },
    { id: 'c', favorite: true, status: 'completed', completedAt: DONE },
    { id: 'd', favorite: false, status: 'saved', completedAt: DONE },
  ];

  it('Favorites includes starred drafts and completed', () => {
    expect(filterHistoryTab(rows, 'favorites').map((row) => row.id)).toEqual(['a', 'c']);
  });

  it('Drafts is anything not completed', () => {
    expect(filterHistoryTab(rows, 'drafts').map((row) => row.id)).toEqual(['a', 'b']);
  });

  it('Completed includes saved as completed', () => {
    expect(filterHistoryTab(rows, 'completed').map((row) => row.id)).toEqual(['c', 'd']);
  });

  it('defaults to Drafts when any draft exists', () => {
    expect(defaultHistoryTab(rows)).toBe('drafts');
    expect(defaultHistoryTab(rows.filter((row) => row.status === 'completed' || row.status === 'saved'))).toBe(
      'completed',
    );
  });
});

describe('completed card', () => {
  it('lists finished exercises and omits body metrics', () => {
    const draft = {
      ...bench([work(135, 8, true)]),
      completedAt: DONE,
      status: 'completed' as const,
    };
    const card = buildCompletedCard(draft);
    expect(card.title).toContain('Chest');
    expect(card.exerciseNames).toEqual(['Incline BB Bench Press']);
    expect(card.weightLine).toContain('lb moved');
    expect(JSON.stringify(card).toLowerCase()).not.toContain('bmi');
    expect(JSON.stringify(card).toLowerCase()).not.toContain('bfp');
  });

  it('hides the weight-moved hero on a draft template', () => {
    const card = buildCompletedCard(bench([work(135, 8, true)]));
    expect(card.draft).toBe(true);
    expect(card.weightLine).toBe('');
  });
});
