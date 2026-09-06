import type { MuscleKey } from '@/lib/lift/muscles';

/**
 * Narrowing a lift history down to the session someone is actually looking for.
 *
 * History grows without bound and every card looks similar, so "the chest day where I finally hit
 * 185" is otherwise a scroll. Filters are deliberately blunt — which muscles, roughly when, and a
 * name search — because anything finer would need a query language nobody wants to learn.
 */

export type LiftDateRange = 'all' | '7d' | '30d' | '90d' | 'year';

export const LIFT_DATE_RANGES = [
  { value: 'all' as const, label: 'Any time' },
  { value: '7d' as const, label: '7 days' },
  { value: '30d' as const, label: '30 days' },
  { value: '90d' as const, label: '3 months' },
  { value: 'year' as const, label: '1 year' },
];

const RANGE_DAYS: Record<Exclude<LiftDateRange, 'all'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
  year: 365,
};

export type LiftHistoryFilter = {
  muscles: MuscleKey[];
  range: LiftDateRange;
  /** Matches the session title, so a renamed "Push A" is findable by name. */
  query: string;
};

export const EMPTY_LIFT_FILTER: LiftHistoryFilter = { muscles: [], range: 'all', query: '' };

export function isFilterActive(filter: LiftHistoryFilter): boolean {
  return filter.muscles.length > 0 || filter.range !== 'all' || filter.query.trim().length > 0;
}

/** How many separate conditions are on, so the button can show a count rather than just a dot. */
export function activeFilterCount(filter: LiftHistoryFilter): number {
  return (
    (filter.muscles.length ? 1 : 0) +
    (filter.range === 'all' ? 0 : 1) +
    (filter.query.trim() ? 1 : 0)
  );
}

export function cutoffForRange(range: LiftDateRange, now: Date = new Date()): Date | null {
  if (range === 'all') {
    return null;
  }
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - RANGE_DAYS[range]);
  return cutoff;
}

type FilterableSession = {
  title: string;
  performedAt: string;
  muscleKeys: readonly MuscleKey[];
};

/**
 * Sessions matching every active condition.
 *
 * Muscles are an OR within themselves and an AND against the other filters: picking Chest and Back
 * means "days I trained either", not "days I trained both", because a session that hit both is
 * still the chest day they were looking for.
 */
export function filterLiftHistory<T extends FilterableSession>(
  rows: readonly T[],
  filter: LiftHistoryFilter,
  now: Date = new Date(),
): T[] {
  const cutoff = cutoffForRange(filter.range, now);
  const needle = filter.query.trim().toLowerCase();
  const wanted = new Set(filter.muscles);

  return rows.filter((row) => {
    if (wanted.size && !row.muscleKeys.some((key) => wanted.has(key))) {
      return false;
    }
    if (cutoff) {
      const performed = new Date(row.performedAt);
      if (Number.isNaN(performed.getTime()) || performed < cutoff) {
        return false;
      }
    }
    if (needle && !row.title.toLowerCase().includes(needle)) {
      return false;
    }
    return true;
  });
}

/** The muscles that actually appear in this history, so the chips never offer a dead filter. */
export function musclesInHistory<T extends FilterableSession>(rows: readonly T[]): MuscleKey[] {
  const seen = new Set<MuscleKey>();
  for (const row of rows) {
    for (const key of row.muscleKeys) {
      seen.add(key);
    }
  }
  return [...seen];
}
