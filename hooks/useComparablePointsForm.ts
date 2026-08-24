import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  COMPARABLE_POINTS_HARD_MAX,
  DEFAULT_PARITY_POINTS,
  cloneComparablePointsConfig,
  emptyActivity,
  emptyComparablePointsConfig,
  emptyQualifier,
  parseComparablePointsConfig,
  validateComparablePointsConfig,
  type ActivityConfig,
  type ComparablePointsConfig,
} from '@/lib/comparablePoints';

function isEmptyComparableDraft(config: ComparablePointsConfig): boolean {
  if (config.parity_points !== DEFAULT_PARITY_POINTS || config.activities.length !== 1) {
    return false;
  }
  const only = config.activities[0];
  return !only.name.trim() && only.parity_qty <= 0 && only.unit === 'minutes';
}

function savedConfigKey(config: ComparablePointsConfig | null): string | null {
  if (!config || config.activities.length < 1) {
    return null;
  }
  return `${config.version}:${config.parity_points}:${config.activities
    .map((activity) => `${activity.id}:${activity.name}:${activity.parity_qty}`)
    .join('|')}`;
}

export function useComparablePointsForm(saved: ComparablePointsConfig | null) {
  const [draft, setDraft] = useState<ComparablePointsConfig>(() =>
    saved && saved.activities.length >= 1
      ? cloneComparablePointsConfig(saved)
      : emptyComparablePointsConfig(),
  );
  const [error, setError] = useState<string | null>(null);
  const appliedKey = useRef<string | null>(savedConfigKey(saved));

  const resetFrom = useCallback((next: unknown) => {
    const parsed = parseComparablePointsConfig(next);
    const nextDraft = parsed ? cloneComparablePointsConfig(parsed) : emptyComparablePointsConfig();
    appliedKey.current = savedConfigKey(parsed);
    setDraft(nextDraft);
    setError(null);
  }, []);

  useEffect(() => {
    if (!saved || saved.activities.length < 1) {
      return;
    }
    const key = savedConfigKey(saved);
    if (!key || appliedKey.current === key) {
      return;
    }
    appliedKey.current = key;
    setDraft((current) =>
      isEmptyComparableDraft(current) ? cloneComparablePointsConfig(saved) : current,
    );
    setError(null);
  }, [saved]);

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
