export const COUNTER_KINDS = ['count', 'decimal', 'money'] as const;
export type CounterKind = (typeof COUNTER_KINDS)[number];

export const COUNTER_STATUSES = ['live', 'saved'] as const;
export type CounterStatus = (typeof COUNTER_STATUSES)[number];

export const COUNTER_METRIC_MAX = 12;

export type CounterMetric = {
  id: string;
  key: string;
  name: string;
  kind: CounterKind;
  value: number;
  sort: number;
};

export type CounterDraft = {
  id: string;
  title: string;
  status: CounterStatus;
  parentId: string | null;
  cardUrl: string | null;
  counterDate: string;
  lastOpenedAt: string | null;
  metrics: CounterMetric[];
  createdAt: string;
  updatedAt: string;
  savedAt: string | null;
};

export type CounterSummary = {
  id: string;
  title: string;
  status: CounterStatus;
  parentId: string | null;
  cardUrl: string | null;
  counterDate: string;
  lastOpenedAt: string | null;
  line: string;
  updatedAt: string;
  savedAt: string | null;
};

export type CounterTemplateId = 'reps' | 'balls' | 'day' | 'sales';

export type CounterTemplate = {
  id: CounterTemplateId;
  label: string;
  metrics: { name: string; kind: CounterKind }[];
};

export type CounterRow = {
  id: string;
  user_id: string;
  title: string;
  status: CounterStatus;
  parent_id: string | null;
  card_url: string | null;
  counter_date: string;
  last_opened_at: string | null;
  created_at: string;
  updated_at: string;
  saved_at: string | null;
};

export type CounterMetricRow = {
  id: string;
  counter_id: string;
  sort_index: number;
  name: string;
  kind: CounterKind;
  value: number;
};
