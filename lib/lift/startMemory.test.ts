import { describe, expect, it } from 'vitest';

import { recalledLiftMuscles, rememberLiftMuscles } from '@/lib/lift/startMemory';

describe('Lift start muscle memory', () => {
  it('keeps the previous selection after Continue so Back can restore it', () => {
    expect(rememberLiftMuscles(['chest'])).toEqual(['chest']);
    expect(recalledLiftMuscles()).toEqual(['chest']);
    expect(rememberLiftMuscles(['chest', 'triceps'])).toEqual(['chest', 'triceps']);
    expect(recalledLiftMuscles()).toEqual(['chest', 'triceps']);
  });
});
