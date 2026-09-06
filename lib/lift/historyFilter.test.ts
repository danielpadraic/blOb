import { describe, expect, it } from 'vitest';

import {
  activeFilterCount,
  EMPTY_LIFT_FILTER,
  filterLiftHistory,
  isFilterActive,
  musclesInHistory,
} from '@/lib/lift/historyFilter';
import type { MuscleKey } from '@/lib/lift/muscles';

const NOW = new Date('2026-09-06T12:00:00Z');

function session(title: string, daysAgo: number, muscleKeys: MuscleKey[]) {
  const performed = new Date(NOW);
  performed.setDate(performed.getDate() - daysAgo);
  return { title, performedAt: performed.toISOString(), muscleKeys };
}

const HISTORY = [
  session('Push A', 1, ['chest', 'triceps']),
  session('Pull day', 5, ['back', 'biceps']),
  session('Leg day', 40, ['quads', 'hamstrings']),
  session('Chest · Sep 6', 200, ['chest']),
];

describe('filterLiftHistory', () => {
  it('returns everything when nothing is set', () => {
    expect(filterLiftHistory(HISTORY, EMPTY_LIFT_FILTER, NOW)).toHaveLength(4);
  });

  it('narrows to a date range', () => {
    const recent = filterLiftHistory(HISTORY, { ...EMPTY_LIFT_FILTER, range: '7d' }, NOW);
    expect(recent.map((row) => row.title)).toEqual(['Push A', 'Pull day']);
  });

  // Picking two muscles means "either", not "both" — a chest-and-back day is still the chest day
  // they were looking for.
  it('treats several muscles as an or', () => {
    const found = filterLiftHistory(
      HISTORY,
      { ...EMPTY_LIFT_FILTER, muscles: ['chest', 'back'] },
      NOW,
    );
    expect(found.map((row) => row.title)).toEqual(['Push A', 'Pull day', 'Chest · Sep 6']);
  });

  it('combines muscle and range with an and', () => {
    const found = filterLiftHistory(
      HISTORY,
      { ...EMPTY_LIFT_FILTER, muscles: ['chest'], range: '30d' },
      NOW,
    );
    expect(found.map((row) => row.title)).toEqual(['Push A']);
  });

  it('finds a renamed session by name', () => {
    const found = filterLiftHistory(HISTORY, { ...EMPTY_LIFT_FILTER, query: 'push' }, NOW);
    expect(found.map((row) => row.title)).toEqual(['Push A']);
  });

  it('ignores an unparseable date rather than showing it anyway', () => {
    const broken = [{ title: 'Bad', performedAt: 'not a date', muscleKeys: ['chest' as MuscleKey] }];
    expect(filterLiftHistory(broken, { ...EMPTY_LIFT_FILTER, range: '7d' }, NOW)).toEqual([]);
  });
});

describe('filter state', () => {
  it('knows when it is doing nothing', () => {
    expect(isFilterActive(EMPTY_LIFT_FILTER)).toBe(false);
    expect(isFilterActive({ ...EMPTY_LIFT_FILTER, range: '7d' })).toBe(true);
    expect(isFilterActive({ ...EMPTY_LIFT_FILTER, query: '  ' })).toBe(false);
  });

  it('counts conditions, not selections', () => {
    expect(activeFilterCount({ muscles: ['chest', 'back'], range: '7d', query: 'x' })).toBe(3);
    expect(activeFilterCount(EMPTY_LIFT_FILTER)).toBe(0);
  });
});

describe('musclesInHistory', () => {
  it('offers only muscles that would actually match something', () => {
    expect(musclesInHistory(HISTORY)).toEqual([
      'chest',
      'triceps',
      'back',
      'biceps',
      'quads',
      'hamstrings',
    ]);
  });
});
