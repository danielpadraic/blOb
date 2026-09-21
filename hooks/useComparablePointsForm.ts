import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  COMPARABLE_POINTS_HARD_MAX,
  DEFAULT_PARITY_POINTS,
  LOG_CHOICE_FIELD_MAX,
  LOG_TEXT_FIELD_MAX,
  cloneComparablePointsConfig,
  emptyActivity,
  emptyComparablePointsConfig,
  emptyLogChoiceField,
  emptyLogTextField,
  emptyQualifier,
  inferScoreWindow,
  parseComparablePointsConfig,
  validateComparablePointsConfig,
  type ActivityConfig,
  type ComparablePointsConfig,
  type LogChoiceField,
  type LogTextField,
  type ScoreWindow,
} from '@/lib/comparablePoints';

function isEmptyComparableDraft(config: ComparablePointsConfig): boolean {
  if (config.parity_points !== DEFAULT_PARITY_POINTS || config.activities.length !== 1) {
    return false;
  }
  const only = config.activities[0];
  const noExtras = (config.text_fields ?? []).length === 0 && (config.choice_fields ?? []).length === 0;
  return !only.name.trim() && only.parity_qty <= 0 && only.unit === 'minutes' && noExtras;
}

function savedConfigKey(config: ComparablePointsConfig | null): string | null {
  if (!config || config.activities.length < 1) {
    return null;
  }
  return `${config.version}:${config.parity_points}:${config.window ?? 'challenge'}:${config.activities
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

  const setWindow = useCallback((window: ScoreWindow) => {
    setDraft((current) => ({ ...current, window: inferScoreWindow(window) }));
    setError(null);
  }, []);

  const setExtrasKeepAdding = useCallback((extras_keep_adding: boolean) => {
    setDraft((current) => ({
      ...current,
      extras_keep_adding,
      activities: current.activities.map((activity) => ({
        ...activity,
        multiplier: {
          ...activity.multiplier,
          extra_factor: extras_keep_adding ? 1 : 0,
        },
      })),
    }));
    setError(null);
  }, []);

  const addActivity = useCallback(() => {
    setDraft((current) => {
      if (current.activities.length >= COMPARABLE_POINTS_HARD_MAX) {
        return current;
      }
      return {
        ...current,
        activities: [
          ...current.activities,
          emptyActivity({
            multiplier: {
              enabled: false,
              extra_factor: current.extras_keep_adding === false ? 0 : 1,
            },
          }),
        ],
      };
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

  const addTextField = useCallback(() => {
    setDraft((current) => {
      const fields = current.text_fields ?? [];
      if (fields.length >= LOG_TEXT_FIELD_MAX) {
        return current;
      }
      return { ...current, text_fields: [...fields, emptyLogTextField()] };
    });
  }, []);

  const patchTextField = useCallback((id: string, partial: Partial<LogTextField>) => {
    setDraft((current) => ({
      ...current,
      text_fields: (current.text_fields ?? []).map((item) =>
        item.id === id ? { ...item, ...partial } : item,
      ),
    }));
    setError(null);
  }, []);

  const removeTextField = useCallback((id: string) => {
    setDraft((current) => ({
      ...current,
      text_fields: (current.text_fields ?? []).filter((item) => item.id !== id),
    }));
  }, []);

  const addChoiceField = useCallback(() => {
    setDraft((current) => {
      const fields = current.choice_fields ?? [];
      if (fields.length >= LOG_CHOICE_FIELD_MAX) {
        return current;
      }
      return { ...current, choice_fields: [...fields, emptyLogChoiceField()] };
    });
  }, []);

  const patchChoiceField = useCallback((id: string, partial: Partial<LogChoiceField>) => {
    setDraft((current) => ({
      ...current,
      choice_fields: (current.choice_fields ?? []).map((item) =>
        item.id === id ? { ...item, ...partial } : item,
      ),
    }));
    setError(null);
  }, []);

  const removeChoiceField = useCallback((id: string) => {
    setDraft((current) => ({
      ...current,
      choice_fields: (current.choice_fields ?? []).filter((item) => item.id !== id),
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
      setWindow,
      setExtrasKeepAdding,
      addActivity,
      removeActivity,
      patchActivity,
      addQualifier,
      patchQualifier,
      removeQualifier,
      addTextField,
      patchTextField,
      removeTextField,
      addChoiceField,
      patchChoiceField,
      removeChoiceField,
      validate,
    }),
    [
      draft,
      error,
      resetFrom,
      setParityPoints,
      setFloorMaster,
      setWindow,
      setExtrasKeepAdding,
      addActivity,
      removeActivity,
      patchActivity,
      addQualifier,
      patchQualifier,
      removeQualifier,
      addTextField,
      patchTextField,
      removeTextField,
      addChoiceField,
      patchChoiceField,
      removeChoiceField,
      validate,
    ],
  );
}

export type ComparablePointsForm = ReturnType<typeof useComparablePointsForm>;
