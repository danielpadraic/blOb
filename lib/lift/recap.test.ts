import { describe, expect, it } from 'vitest';

import { buildRecap, exerciseDetail, hasShareableWork, recapFallbackText } from '@/lib/lift/recap';
import { newSessionDraft } from '@/lib/lift/session';
import type { LiftExerciseDraft, LiftSessionDraft, LiftSetDraft } from '@/lib/lift/types';

const DONE = '2026-09-05T19:00:00Z';

function set(weight: number | null, reps: number | null, done = true): LiftSetDraft {
  return {
    key: `set-${Math.random()}`,
    kind: 'work',
    weight,
    reps,
    completedAt: done ? DONE : null,
  };
}

function exercise(name: string, sets: LiftSetDraft[], supersetGroup: number | null = null): LiftExerciseDraft {
  return {
    key: `ex-${name}`,
    exerciseId: null,
    customExerciseId: null,
    name,
    muscleKey: 'chest',
    supersetGroup,
    sets,
  };
}

function session(exercises: LiftExerciseDraft[]): LiftSessionDraft {
  return {
    ...newSessionDraft({ muscleKeys: ['chest', 'triceps'], unit: 'lb' }),
    performedAt: '2026-09-05T18:00:00Z',
    exercises,
  };
}

describe('exercise detail line', () => {
  it('reads sets by heaviest weight by reps', () => {
    const row = exercise('Flat DB Bench', [set(52.5, 10), set(52.5, 10), set(52.5, 10), set(52.5, 10)]);
    expect(exerciseDetail(row, 'lb')).toBe('4 × 52.5 lb × 10');
  });

  it('shows a rep range when the reps moved across the sets', () => {
    const row = exercise('Flat DB Bench', [set(52.5, 10), set(52.5, 9), set(52.5, 8)]);
    expect(exerciseDetail(row, 'lb')).toBe('3 × 52.5 lb × 8–10');
  });

  it('reports the heaviest set, not the first one', () => {
    const row = exercise('Incline BB Bench', [set(135, 8), set(185, 5)]);
    expect(exerciseDetail(row, 'lb')).toBe('2 × 185 lb × 5–8');
  });

  it('counts only completed sets when some were checked off', () => {
    const row = exercise('Flat DB Bench', [set(50, 10), set(50, 10), set(50, 10, false)]);
    expect(exerciseDetail(row, 'lb')).toBe('2 × 50 lb × 10');
  });

  it('falls back to every working set when nothing was checked off', () => {
    const row = exercise('Flat DB Bench', [set(50, 10, false), set(50, 10, false)]);
    expect(exerciseDetail(row, 'lb')).toBe('2 × 50 lb × 10');
  });

  it('handles a bodyweight exercise with no load', () => {
    const row = exercise('Pull-up', [set(null, 8), set(null, 7)]);
    expect(exerciseDetail(row, 'lb')).toBe('2 × 7–8');
  });

  it('degrades to a set count when the rows carry no numbers', () => {
    const row = exercise('Stretching', [set(null, null), set(null, null)]);
    expect(exerciseDetail(row, 'lb')).toBe('2 sets');
  });

  it('never counts warm-ups', () => {
    const row = exercise('Incline BB Bench', [
      { key: 'w', kind: 'warmup', weight: 45, reps: 10, completedAt: DONE },
      set(135, 8),
    ]);
    expect(exerciseDetail(row, 'lb')).toBe('1 × 135 lb × 8');
  });
});

describe('recap card', () => {
  it('titles itself from the muscles and date when unnamed', () => {
    const recap = buildRecap(session([exercise('Flat DB Bench', [set(52.5, 10)])]));
    expect(recap.title).toBe('Chest · Triceps · Sep 5');
    expect(recap.muscles).toBe('Chest · Triceps');
  });

  it('collapses a superset pair into a single block', () => {
    const recap = buildRecap(
      session([
        exercise('Incline BB', [set(135, 8)], 1),
        exercise('DB Flyes', [set(30, 12)], 1),
        exercise('Cable Fly', [set(25, 15)]),
      ]),
    );
    expect(recap.lines).toHaveLength(2);
    expect(recap.lines[0].name).toBe('A1 Incline BB · A2 DB Flyes');
    expect(recap.lines[0].superset).toBe(true);
    expect(recap.lines[1].name).toBe('Cable Fly');
  });

  it('caps the card and counts the overflow', () => {
    const many = Array.from({ length: 9 }, (_, index) =>
      exercise(`Lift ${index + 1}`, [set(100, 5)]),
    );
    const recap = buildRecap(session(many), 6);
    expect(recap.lines).toHaveLength(6);
    expect(recap.moreCount).toBe(3);
  });

  it('carries the overload chip when the session was bumped', () => {
    const draft = session([exercise('Flat DB Bench', [set(55, 10)])]);
    draft.overloadSummary = {
      weightDelta: { mode: 'amount', amount: 5, unit: 'lb' },
      repsDelta: null,
    };
    expect(buildRecap(draft).overloadChip).toBe('+5 lb');
  });

  it('has no chip on a session that was not bumped', () => {
    expect(buildRecap(session([exercise('Flat DB Bench', [set(50, 10)])])).overloadChip).toBe('');
  });

  it('counts only completed working sets', () => {
    const recap = buildRecap(
      session([
        exercise('Flat DB Bench', [
          { key: 'w', kind: 'warmup', weight: 45, reps: 10, completedAt: DONE },
          set(50, 10),
          set(50, 10),
        ]),
      ]),
    );
    expect(recap.setCount).toBe(2);
  });
});

describe('shareability', () => {
  it('needs at least one completed working set', () => {
    expect(hasShareableWork(session([exercise('Flat DB Bench', [set(50, 10)])]))).toBe(true);
    expect(hasShareableWork(session([exercise('Flat DB Bench', [set(50, 10, false)])]))).toBe(false);
    expect(hasShareableWork(session([]))).toBe(false);
    expect(hasShareableWork(null)).toBe(false);
  });

  it('does not count a completed warm-up as work', () => {
    const warmupOnly = session([
      exercise('Flat DB Bench', [
        { key: 'w', kind: 'warmup', weight: 45, reps: 10, completedAt: DONE },
      ]),
    ]);
    expect(hasShareableWork(warmupOnly)).toBe(false);
  });
});

describe('fallback text on the post', () => {
  it('stays readable without the card component', () => {
    const recap = buildRecap(
      session([exercise('Flat DB Bench', [set(52.5, 10)]), exercise('Cable Fly', [set(25, 15)])]),
    );
    expect(recapFallbackText(recap)).toBe(
      'Chest · Triceps · Sep 5\nFlat DB Bench · 1 × 52.5 lb × 10\nCable Fly · 1 × 25 lb × 15',
    );
  });
});
