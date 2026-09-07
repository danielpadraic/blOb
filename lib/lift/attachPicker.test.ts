import { describe, expect, it } from 'vitest';

import { attachStatusChip, filterAttachableSessions } from '@/lib/lift/attachPicker';
import type { LiftSessionSummary } from '@/lib/lift/types';

function session(partial: Partial<LiftSessionSummary> & { id: string; title: string }): LiftSessionSummary {
  return {
    performedAt: '2026-09-07T12:00:00.000Z',
    completedAt: null,
    muscleKeys: ['chest'],
    unit: 'lb',
    exerciseCount: 1,
    setCount: 3,
    preview: ['Incline BB Bench Press · 3 sets'],
    ...partial,
  };
}

describe('attach picker', () => {
  it('sorts newest first and never prefers last-open', () => {
    const rows = [
      session({ id: 'old', title: 'Old', performedAt: '2026-09-01T12:00:00.000Z' }),
      session({ id: 'new', title: 'New', performedAt: '2026-09-07T12:00:00.000Z' }),
      session({ id: 'mid', title: 'Mid', performedAt: '2026-09-04T12:00:00.000Z' }),
    ];
    expect(filterAttachableSessions(rows).map((row) => row.id)).toEqual(['new', 'mid', 'old']);
  });

  it('keeps drafts and completed together', () => {
    const rows = [
      session({ id: 'd', title: 'Draft', status: 'open', completedAt: null }),
      session({
        id: 'c',
        title: 'Done',
        status: 'completed',
        completedAt: '2026-09-07T18:00:00.000Z',
        performedAt: '2026-09-06T12:00:00.000Z',
      }),
    ];
    expect(filterAttachableSessions(rows).map((row) => row.id)).toEqual(['d', 'c']);
    expect(attachStatusChip(rows[0])).toBe('Draft');
    expect(attachStatusChip(rows[1])).toBe('Completed');
  });

  it('filters by title without inventing a default id', () => {
    const rows = [
      session({ id: 'a', title: 'Chest · Triceps · Sep 6' }),
      session({ id: 'b', title: 'Legs · Sep 5' }),
    ];
    expect(filterAttachableSessions(rows, 'chest').map((row) => row.id)).toEqual(['a']);
    expect(filterAttachableSessions(rows, 'missing')).toEqual([]);
  });
});
