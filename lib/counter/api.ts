import {
  clampCounterDate,
  clampCounterName,
  clampCounterValue,
  defaultCounterDate,
  defaultCounterTitle,
  formatCounterSummary,
  isCounterKind,
  makeMetric,
  pickLastLiveCounter,
} from '@/lib/counter/session';
import type { CounterDraft, CounterKind, CounterMetric, CounterStatus, CounterSummary } from '@/lib/counter/types';
import { supabase } from '@/lib/supabase';

const COUNTER_COLUMNS =
  'id, user_id, title, status, parent_id, card_url, counter_date, last_opened_at, created_at, updated_at, saved_at';
const METRIC_COLUMNS = 'id, counter_id, sort_index, name, kind, value';

function fail(message: string, error: { message?: string } | null): never {
  throw new Error(error?.message ? `${message}: ${error.message}` : message);
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) {
    throw new Error('You need to be signed in.');
  }
  return userId;
}

function asStatus(value: unknown): CounterStatus {
  return value === 'saved' ? 'saved' : 'live';
}

function metricsFromEmbedded(rows: unknown): CounterMetric[] {
  return (Array.isArray(rows) ? rows : []).map((row) => metricFromRow(row as never));
}

function metricFromRow(row: {
  id?: string;
  sort_index?: number;
  name?: string;
  kind?: string;
  value?: number | string;
}): CounterMetric {
  const kind: CounterKind = isCounterKind(row.kind) ? row.kind : 'count';
  return {
    id: String(row.id ?? ''),
    key: String(row.id ?? makeMetric({ name: 'Metric', kind }).key),
    name: clampCounterName(String(row.name ?? 'Metric')) || 'Metric',
    kind,
    value: clampCounterValue(kind, Number(row.value ?? 0)),
    sort: Number(row.sort_index ?? 0),
  };
}

function draftFromRows(
  row: {
    id: string;
    title?: string | null;
    status?: string | null;
    parent_id?: string | null;
    card_url?: string | null;
    counter_date?: string | null;
    last_opened_at?: string | null;
    created_at?: string;
    updated_at?: string;
    saved_at?: string | null;
  },
  metrics: CounterMetric[],
): CounterDraft {
  return {
    id: row.id,
    title: clampCounterName(String(row.title ?? '')) || defaultCounterTitle(),
    status: asStatus(row.status),
    parentId: row.parent_id ?? null,
    cardUrl: row.card_url ?? null,
    counterDate: clampCounterDate(row.counter_date),
    lastOpenedAt: row.last_opened_at ?? null,
    metrics: [...metrics].sort((a, b) => a.sort - b.sort),
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
    savedAt: row.saved_at ?? null,
  };
}

function toSummary(draft: CounterDraft): CounterSummary {
  return {
    id: draft.id,
    title: draft.title,
    status: draft.status,
    parentId: draft.parentId,
    cardUrl: draft.cardUrl,
    counterDate: draft.counterDate,
    lastOpenedAt: draft.lastOpenedAt,
    line: formatCounterSummary(draft.metrics),
    updatedAt: draft.updatedAt,
    savedAt: draft.savedAt,
  };
}

async function fetchMetrics(counterId: string): Promise<CounterMetric[]> {
  const { data, error } = await supabase
    .from('counter_metrics')
    .select(METRIC_COLUMNS)
    .eq('counter_id', counterId)
    .order('sort_index', { ascending: true });
  if (error) {
    fail('Could not load those numbers', error);
  }
  return (data ?? []).map(metricFromRow);
}

export async function fetchLiveCounters(): Promise<CounterSummary[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('counters')
    .select(`${COUNTER_COLUMNS}, counter_metrics(${METRIC_COLUMNS})`)
    .eq('user_id', userId)
    .eq('status', 'live')
    .order('updated_at', { ascending: false });
  if (error) {
    fail('Could not load your counters', error);
  }
  return (data ?? []).map((row) => {
    return toSummary({
      ...draftFromRows(row, metricsFromEmbedded((row as { counter_metrics?: unknown }).counter_metrics)),
      status: 'live',
    });
  });
}

export async function fetchSavedCounters(): Promise<CounterSummary[]> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('counters')
    .select(`${COUNTER_COLUMNS}, counter_metrics(${METRIC_COLUMNS})`)
    .eq('user_id', userId)
    .eq('status', 'saved')
    .order('saved_at', { ascending: false });
  if (error) {
    fail('Could not load history', error);
  }
  return (data ?? []).map((row) => {
    return toSummary({
      ...draftFromRows(row, metricsFromEmbedded((row as { counter_metrics?: unknown }).counter_metrics)),
      status: 'saved',
    });
  });
}

export async function fetchCounter(id: string): Promise<CounterDraft> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('counters')
    .select(COUNTER_COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    fail('Could not open that counter', error);
  }
  if (!data) {
    throw new Error('That counter is gone.');
  }
  return draftFromRows(data, await fetchMetrics(id));
}

export async function resolveLastLiveCounterId(): Promise<string | null> {
  const rows = await fetchLiveCounters();
  return pickLastLiveCounter(rows)?.id ?? null;
}

export async function touchCounterOpened(id: string): Promise<void> {
  const userId = await currentUserId();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('counters')
    .update({ last_opened_at: now })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('status', 'live');
  if (error) {
    fail('Could not keep that counter open', error);
  }
}

export async function createLiveCounter(input: {
  title?: string;
  counterDate?: string;
  metrics: { name: string; kind: CounterKind }[];
}): Promise<string> {
  const userId = await currentUserId();
  const title = clampCounterName(input.title ?? '') || defaultCounterTitle();
  const counterDate = clampCounterDate(input.counterDate ?? defaultCounterDate());
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('counters')
    .insert({
      user_id: userId,
      title,
      status: 'live',
      counter_date: counterDate,
      last_opened_at: now,
    })
    .select('id')
    .single();
  if (error) {
    fail('Could not start that counter', error);
  }
  const id = String((data as { id: string }).id);
  const rows = input.metrics.slice(0, 12).map((metric, index) => ({
    counter_id: id,
    sort_index: index,
    name: clampCounterName(metric.name) || `Metric ${index + 1}`,
    kind: metric.kind,
    value: 0,
  }));
  if (rows.length) {
    const written = await supabase.from('counter_metrics').insert(rows);
    if (written.error) {
      fail('Could not add those metrics', written.error);
    }
  }
  return id;
}

export async function saveCounterDraft(draft: CounterDraft): Promise<void> {
  const userId = await currentUserId();
  if (draft.status === 'saved') {
    return;
  }
  const title = clampCounterName(draft.title) || defaultCounterTitle();
  const { error } = await supabase
    .from('counters')
    .update({
      title,
      counter_date: clampCounterDate(draft.counterDate),
      updated_at: new Date().toISOString(),
    })
    .eq('id', draft.id)
    .eq('user_id', userId)
    .eq('status', 'live');
  if (error) {
    fail('Could not save those numbers', error);
  }
  const existing = await fetchMetrics(draft.id);
  const keep = new Set(draft.metrics.map((row) => row.id).filter(Boolean));
  const stale = existing.filter((row) => row.id && !keep.has(row.id));
  if (stale.length) {
    const removed = await supabase.from('counter_metrics').delete().in(
      'id',
      stale.map((row) => row.id),
    );
    if (removed.error) {
      fail('Could not remove that metric', removed.error);
    }
  }
  for (const [index, metric] of draft.metrics.entries()) {
    const payload = {
      sort_index: index,
      name: clampCounterName(metric.name) || `Metric ${index + 1}`,
      kind: metric.kind,
      value: clampCounterValue(metric.kind, metric.value),
    };
    if (metric.id) {
      const updated = await supabase.from('counter_metrics').update(payload).eq('id', metric.id);
      if (updated.error) {
        fail('Could not update that number', updated.error);
      }
    } else {
      const inserted = await supabase.from('counter_metrics').insert({ ...payload, counter_id: draft.id }).select('id').single();
      if (inserted.error) {
        fail('Could not add that metric', inserted.error);
      }
      metric.id = String((inserted.data as { id: string }).id);
      metric.key = metric.id;
    }
  }
}

export async function snapshotCounter(draft: CounterDraft): Promise<string> {
  await saveCounterDraft(draft);
  const userId = await currentUserId();
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('counters')
    .insert({
      user_id: userId,
      title: clampCounterName(draft.title) || defaultCounterTitle(),
      status: 'saved',
      parent_id: draft.id,
      card_url: draft.cardUrl,
      counter_date: clampCounterDate(draft.counterDate),
      saved_at: now,
    })
    .select('id')
    .single();
  if (error) {
    fail('Could not lock that snapshot', error);
  }
  const id = String((data as { id: string }).id);
  const rows = draft.metrics.map((metric, index) => ({
    counter_id: id,
    sort_index: index,
    name: clampCounterName(metric.name) || `Metric ${index + 1}`,
    kind: metric.kind,
    value: clampCounterValue(metric.kind, metric.value),
  }));
  if (rows.length) {
    const written = await supabase.from('counter_metrics').insert(rows);
    if (written.error) {
      fail('Could not copy those numbers', written.error);
    }
  }
  return id;
}

export async function setCounterCardUrl(id: string, cardUrl: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from('counters')
    .update({ card_url: cardUrl })
    .eq('id', id)
    .eq('user_id', userId);
  if (error) {
    fail('Could not keep that card', error);
  }
}

export async function deleteCounter(id: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('counters').delete().eq('id', id).eq('user_id', userId);
  if (error) {
    fail('Could not delete that counter', error);
  }
}
