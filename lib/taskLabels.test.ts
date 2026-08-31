import { describe, expect, it } from 'vitest';

import { taskLetterLabel } from '@/lib/taskLabels';

describe('taskLetterLabel', () => {
  it('labels Task A, Task B, Task C', () => {
    expect(taskLetterLabel(0)).toBe('Task A');
    expect(taskLetterLabel(1)).toBe('Task B');
    expect(taskLetterLabel(2)).toBe('Task C');
  });

  it('never says Workout B', () => {
    expect(taskLetterLabel(1)).not.toMatch(/Workout/i);
  });
});
