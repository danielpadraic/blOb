import { describe, expect, it } from 'vitest';

import { addExercise, newSessionDraft, refreshSessionMeta } from '@/lib/lift/session';
import { buildLiftSnapshot, draftFromLiftSnapshot, parseLiftSnapshot } from '@/lib/lift/snapshot';

describe('lift share snapshot', () => {
  it('round-trips the roster and last numbers', () => {
    let draft = addExercise(newSessionDraft({ muscleKeys: ['legs'], unit: 'lb' }), {
      name: 'Back Squat',
      muscleKey: 'quads',
      exerciseId: 'back_squat',
    });
    draft = refreshSessionMeta({
      ...draft,
      ownerUserId: 'author-1',
      ownerName: 'Courtney',
      title: 'Legs · Sep 10',
      exercises: draft.exercises.map((row) => ({
        ...row,
        sets: [
          { key: 's1', kind: 'work', weight: 185, reps: 5, completedAt: '2026-09-10T18:00:00.000Z' },
          { key: 's2', kind: 'work', weight: 185, reps: 5, completedAt: '2026-09-10T18:01:00.000Z' },
        ],
      })),
    });

    const snap = buildLiftSnapshot(draft);
    const parsed = parseLiftSnapshot(JSON.parse(JSON.stringify(snap)));
    expect(parsed?.sessionId).toBe(draft.id);
    expect(parsed?.ownerName).toBe('Courtney');
    const copy = draftFromLiftSnapshot(parsed!);
    expect(copy.exercises[0]?.name).toBe('Back Squat');
    expect(copy.exercises[0]?.sets.map((set) => set.weight)).toEqual([185, 185]);
    expect(copy.exercises[0]?.sets.map((set) => set.reps)).toEqual([5, 5]);
  });

  it('rejects junk so a missing session cannot crash Live', () => {
    expect(parseLiftSnapshot(null)).toBeNull();
    expect(parseLiftSnapshot({ v: 1 })).toBeNull();
    expect(parseLiftSnapshot({ title: 'Legs' })).toBeNull();
  });
});
