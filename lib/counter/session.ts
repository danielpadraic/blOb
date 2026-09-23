import { format } from 'date-fns';

import {
  COUNTER_METRIC_MAX,
  type CounterDraft,
  type CounterKind,
  type CounterMetric,
  type CounterSummary,
  type CounterTemplate,
} from '@/lib/counter/types';

export const COUNTER_TEMPLATES: readonly CounterTemplate[] = [
  { id: 'reps', label: 'Reps', metrics: [{ name: 'Reps', kind: 'count' }] },
  {
    id: 'balls',
    label: 'Balls & Strikes',
    metrics: [
      { name: 'Balls', kind: 'count' },
      { name: 'Strikes', kind: 'count' },
    ],
  },
  {
    id: 'day',
    label: 'Day log',
    metrics: [
      { name: 'Metric 1', kind: 'count' },
      { name: 'Metric 2', kind: 'count' },
      { name: 'Metric 3', kind: 'count' },
    ],
  },
  {
    id: 'sales',
    label: 'Sales day',
    metrics: [
      { name: 'Count', kind: 'count' },
      { name: 'Count 2', kind: 'count' },
      { name: 'Amount', kind: 'money' },
    ],
  },
];

export function defaultCounterTitle(now = new Date()): string {
  return format(now, 'MMM d');
}

export function clampCounterName(raw: string): string {
  return String(raw ?? '').trim().slice(0, 80);
}

export function isCounterKind(value: unknown): value is CounterKind {
  return value === 'count' || value === 'decimal' || value === 'money';
}

export function clampCounterValue(kind: CounterKind, value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  if (kind === 'count') {
    return Math.floor(value);
  }
  return Math.round(value * 100) / 100;
}

export function parseCounterInput(kind: CounterKind, text: string): number {
  const cleaned = String(text ?? '').replace(/[^0-9.]/g, '');
  if (!cleaned || cleaned === '.') {
    return 0;
  }
  const parsed = kind === 'count' ? Number.parseInt(cleaned, 10) : Number(cleaned);
  return clampCounterValue(kind, parsed);
}

export function counterStep(kind: CounterKind, current: number): number {
  if (kind === 'decimal' && !Number.isInteger(current)) {
    return 0.01;
  }
  return 1;
}

export function stepCounterValue(kind: CounterKind, value: number, direction: 1 | -1): number {
  return clampCounterValue(kind, value + direction * counterStep(kind, value));
}

export function formatCounterNumber(kind: CounterKind, value: number): string {
  const safe = clampCounterValue(kind, value);
  if (kind === 'money') {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    }).format(safe);
  }
  if (kind === 'decimal') {
    return Number.isInteger(safe) ? String(safe) : safe.toFixed(2).replace(/\.?0+$/, '');
  }
  return String(safe);
}

export function formatCounterSummary(metrics: readonly CounterMetric[]): string {
  return metrics
    .map((row) => `${row.name} ${formatCounterNumber(row.kind, row.value)}`)
    .join(' · ');
}

function localKey(): string {
  return `m-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function makeMetric(input: { name: string; kind: CounterKind; value?: number; sort?: number }): CounterMetric {
  return {
    id: '',
    key: localKey(),
    name: clampCounterName(input.name) || 'Metric',
    kind: input.kind,
    value: clampCounterValue(input.kind, input.value ?? 0),
    sort: input.sort ?? 0,
  };
}

export function metricsFromTemplate(template: CounterTemplate): CounterMetric[] {
  return template.metrics.map((row, index) => makeMetric({ ...row, sort: index }));
}

export function addCounterMetric(
  draft: CounterDraft,
  input: { name: string; kind: CounterKind },
): CounterDraft {
  if (draft.metrics.length >= COUNTER_METRIC_MAX) {
    return draft;
  }
  return {
    ...draft,
    metrics: [...draft.metrics, makeMetric({ ...input, sort: draft.metrics.length })],
  };
}

export function removeCounterMetric(draft: CounterDraft, key: string): CounterDraft {
  return {
    ...draft,
    metrics: draft.metrics.filter((row) => row.key !== key).map((row, index) => ({ ...row, sort: index })),
  };
}

export function renameCounterMetric(draft: CounterDraft, key: string, name: string): CounterDraft {
  const next = clampCounterName(name);
  if (!next) {
    return draft;
  }
  return {
    ...draft,
    metrics: draft.metrics.map((row) => (row.key === key ? { ...row, name: next } : row)),
  };
}

export function setCounterMetricValue(draft: CounterDraft, key: string, value: number): CounterDraft {
  return {
    ...draft,
    metrics: draft.metrics.map((row) =>
      row.key === key ? { ...row, value: clampCounterValue(row.kind, value) } : row,
    ),
  };
}

export function clearCounterValues(draft: CounterDraft): CounterDraft {
  return {
    ...draft,
    metrics: draft.metrics.map((row) => ({ ...row, value: 0 })),
  };
}

export function blankLiveFrom(source: CounterDraft, now = new Date()): Omit<CounterDraft, 'id'> {
  return {
    title: source.title,
    status: 'live',
    parentId: null,
    cardUrl: null,
    metrics: source.metrics.map((row, index) => makeMetric({ name: row.name, kind: row.kind, sort: index })),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    savedAt: null,
  };
}

export function toCounterSummary(draft: CounterDraft): CounterSummary {
  return {
    id: draft.id,
    title: draft.title,
    status: draft.status,
    parentId: draft.parentId,
    cardUrl: draft.cardUrl,
    line: formatCounterSummary(draft.metrics),
    updatedAt: draft.updatedAt,
    savedAt: draft.savedAt,
  };
}
