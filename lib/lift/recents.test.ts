import { describe, expect, it } from 'vitest';

import { officialExercise } from '@/lib/lift/catalog';
import {
  recentExerciseOptions,
  rememberRecentExercise,
  resetRecentExercisesForTests,
} from '@/lib/lift/recents';

describe('lift recents', () => {
  it('puts the last official movement first and ignores unknown ids', () => {
    resetRecentExercisesForTests();
    rememberRecentExercise('bodyweight-squat');
    rememberRecentExercise('not-a-real-exercise');
    rememberRecentExercise('box-jump');
    const ids = recentExerciseOptions().map((row) => row.id);
    expect(ids[0]).toBe('box-jump');
    expect(ids).toContain('bodyweight-squat');
    expect(ids).not.toContain('not-a-real-exercise');
    expect(officialExercise('box-jump')?.muscle).toBe('quads');
  });
});
