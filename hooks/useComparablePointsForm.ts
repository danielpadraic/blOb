import { useCallback, useMemo, useState } from 'react';

import {
  COMPARABLE_POINTS_HARD_MAX,
  cloneComparablePointsConfig,
  emptyActivity,
  emptyComparablePointsConfig,
  emptyQualifier,
  parseComparablePointsConfig,
  validateComparablePointsConfig,
  type ActivityConfig,
  type ComparablePointsConfig,
} from '@/lib/comparablePoints';

export function useComparablePointsForm(saved: ComparablePointsConfig | null) {
  const [draft, setDraft] = useState<ComparablePointsConfig>(() =>
    saved ? cloneComparablePointsConfig(saved) : emptyComparablePointsConfig(),
  );
  const [error, setError] = useState<string | null>(null);

  const resetFrom = useCallback((next: unknown) => {
    const parsed = parseComparablePointsConfig(next);
    setDraft(parsed ? cloneComparablePointsConfig(parsed) : emptyComparablePointsConfig());
    setError(null);
  }, []);

  const setParityPoints = useCallback((value: number | string) => {
    const parsed = Math.round(Number(value) || 0);
    setDraft((current) => ({ ...current, parity_points: parsed }));
    setError(null);
  }, []);

  const setFloorMaster = useCallback((floor_master: boolean) => {
    setDraft((current) => ({ ...current, floor_master }));
    setError(null);
  }, []);

  const addActivity = useCallback(() => {
    setDraft((current) => {
      if (current.activities.length >= COMPARABLE_POINTS_HARD_MAX) {
        return current;
      }
      return { ...current, activities: [...current.activities, emptyActivity()] };
    });
  }, []);

  const removeActivity = useCallback((id: string) => {
    setDraft((current) => {
      if (current.activities.length <= 1) {
        return current;
      }
      return { ...current, activities: current.activities.filter((item) => item.id !== id) };
    });
  }, []);

  const patchActivity = useCallback((id: string, partial: Partial<ActivityConfig>) => {
    setDraft((current) => ({
      ...current,
      activities: current.activities.map((item) => (item.id === id ? { ...item, ...partial } : item)),
    }));
    setError(null);
  }, []);

  const addQualifier = useCallback((activityId: string) => {
    setDraft((current) => ({
      ...current,
      activities: current.activities.map((item) =>
        item.id === activityId
          ? {
              ...item,
              qualifiers: {
                ...item.qualifiers,
                items: [...item.qualifiers.items, emptyQualifier()],
              },
            }
          : item,
      ),
    }));
  }, []);

  const patchQualifier = useCallback((activityId: string, qualifierId: string, label: string) => {
    setDraft((current) => ({
      ...current,
      activities: current.activities.map((item) =>
        item.id === activityId
          ? {
              ...item,
              qualifiers: {
                ...item.qualifiers,
                items: item.qualifiers.items.map((row) =>
                  row.id === qualifierId ? { ...row, label } : row,
                ),
              },
            }
          : item,
      ),
    }));
  }, []);

  const removeQualifier = useCallback((activityId: string, qualifierId: string) => {
    setDraft((current) => ({
      ...current,
      activities: current.activities.map((item) => {
        if (item.id !== activityId) {
          return item;
        }
        const items = item.qualifiers.items.filter((row) => row.id !== qualifierId);
        return {
          ...item,
          qualifiers: {
            ...item.qualifiers,
            items: items.length > 0 ? items : [emptyQualifier()],
          },
        };
      }),
    }));
  }, []);

  const validate = useCallback(() => {
    const result = validateComparablePointsConfig(draft);
    if (!result.ok) {
      setError(result.message);
      return result;
    }
    setError(null);
    setDraft(cloneComparablePointsConfig(result.config));
    return result;
  }, [draft]);

  return useMemo(
    () => ({
      draft,
      error,
      resetFrom,
      setParityPoints,
      setFloorMaster,
      addActivity,
      removeActivity,
      patchActivity,
      addQualifier,
      patchQualifier,
      removeQualifier,
      validate,
    }),
    [
      draft,
      error,
      resetFrom,
      setParityPoints,
      setFloorMaster,
      addActivity,
      removeActivity,
      patchActivity,
      addQualifier,
      patchQualifier,
      removeQualifier,
      validate,
    ],
  );
}

export type ComparablePointsForm = ReturnType<typeof useComparablePointsForm>;
