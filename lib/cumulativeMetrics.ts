import { amountToMeters, parseDistanceText, type DistanceUnit } from '@/lib/distance';

export const CUMULATIVE_METRIC_CAP = 4;

export type CumulativeWinWindow = 'challenge' | 'week';

export type CumulativeMetric = {
  id: string;
  target: number;
  name: string;
  unit?: DistanceUnit | null;
};

const DISTANCE_NAMES = new Set([
  'mile',
  'miles',
  'mi',
  'km',
  'k',
  'kilometer',
  'kilometers',
  'kilometre',
  'kilometres',
]);

export function newCumulativeMetric(partial?: Partial<CumulativeMetric>): CumulativeMetric {
  return {
    id: partial?.id ?? `m_${Math.random().toString(36).slice(2, 10)}`,
    target: Math.max(Number(partial?.target) || 0, 0),
    name: String(partial?.name ?? '').trim(),
    unit: partial?.unit === 'km' ? 'km' : partial?.unit === 'mi' ? 'mi' : null,
  };
}

export function defaultCumulativeMetrics(): CumulativeMetric[] {
  return [newCumulativeMetric({ target: 0, name: '' })];
}

export function isDistanceMetricName(name: string | null | undefined): boolean {
  const key = String(name ?? '')
    .trim()
    .toLowerCase()
    .replace(/[.\s]+/g, '');
  return DISTANCE_NAMES.has(key);
}

export function metricAllowsDecimals(metric: Pick<CumulativeMetric, 'name' | 'unit'>): boolean {
  return metric.unit === 'mi' || metric.unit === 'km' || isDistanceMetricName(metric.name);
}

export function metricUnitLabel(metric: Pick<CumulativeMetric, 'name' | 'unit'>): string {
  if (metric.unit === 'km') {
    return 'km';
  }
  if (metric.unit === 'mi') {
    return 'mi';
  }
  const key = String(metric.name ?? '')
    .trim()
    .toLowerCase();
  if (key === 'km' || key === 'k' || key.startsWith('kilometer') || key.startsWith('kilometre')) {
    return 'km';
  }
  if (key === 'mi' || key === 'mile' || key === 'miles') {
    return 'mi';
  }
  return String(metric.name ?? '').trim();
}

export function applyMetricName(metric: CumulativeMetric, name: string): CumulativeMetric {
  const next = { ...metric, name };
  if (!isDistanceMetricName(name)) {
    return { ...next, unit: null };
  }
  const key = name.trim().toLowerCase().replace(/[.\s]+/g, '');
  if (key === 'km' || key === 'k' || key.startsWith('kilometer') || key.startsWith('kilometre')) {
    return { ...next, unit: 'km' };
  }
  return { ...next, unit: next.unit === 'km' ? 'km' : 'mi' };
}

export function applyMetricUnit(metric: CumulativeMetric, unit: DistanceUnit): CumulativeMetric {
  if (!isDistanceMetricName(metric.name)) {
    return { ...metric, unit: null };
  }
  const key = metric.name.trim().toLowerCase().replace(/[.\s]+/g, '');
  const mileName = key === 'mi' || key === 'mile' || key === 'miles' || key === '';
  const kmName = key === 'km' || key === 'k' || key.startsWith('kilometer') || key.startsWith('kilometre');
  if (unit === 'km' && mileName) {
    return { ...metric, unit, name: metric.name.trim() ? 'km' : metric.name };
  }
  if (unit === 'mi' && kmName) {
    return { ...metric, unit, name: metric.name.trim() ? 'mi' : metric.name };
  }
  return { ...metric, unit };
}

function asMetricRow(raw: unknown, index: number): CumulativeMetric | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const target = Number(row.target ?? row.amount ?? row.value);
  const name = String(row.name ?? row.label ?? row.unit_name ?? '').trim();
  const unit =
    row.unit === 'km' || row.unit === 'mi'
      ? row.unit
      : isDistanceMetricName(name)
        ? name.toLowerCase().includes('km') || name.toLowerCase().startsWith('kilo')
          ? 'km'
          : 'mi'
        : null;
  return newCumulativeMetric({
    id: typeof row.id === 'string' && row.id.trim() ? row.id : `m${index + 1}`,
    target: Number.isFinite(target) ? Math.max(target, 0) : 0,
    name,
    unit,
  });
}

export function parseCumulativeMetrics(raw: unknown): CumulativeMetric[] {
  if (Array.isArray(raw)) {
    return raw
      .map((row, index) => asMetricRow(row, index))
      .filter((row): row is CumulativeMetric => row != null)
      .slice(0, CUMULATIVE_METRIC_CAP);
  }
  if (raw && typeof raw === 'object') {
    const record = raw as Record<string, unknown>;
    if (Array.isArray(record.metrics)) {
      return parseCumulativeMetrics(record.metrics);
    }
  }
  return [];
}

export function metricsFromLegacyTarget(input: {
  cumulative_target?: string | number | null;
  cumulative_metric?: string | null;
  title?: string | null;
  task?: string | null;
}): CumulativeMetric[] {
  const stored = Number(input.cumulative_target);
  if (!Number.isFinite(stored) || stored <= 0) {
    const fromTitle =
      parseDistanceText(input.title ?? '') ?? parseDistanceText(input.task ?? '');
    if (fromTitle && fromTitle > 0) {
      const miles = Math.round((fromTitle / 1609.34) * 100) / 100;
      return [newCumulativeMetric({ id: 'm1', target: miles, name: 'miles', unit: 'mi' })];
    }
    return defaultCumulativeMetrics();
  }
  const titleMeters =
    parseDistanceText(input.title ?? '') ?? parseDistanceText(input.task ?? '');
  const looksMeters =
    stored >= 100 &&
    (input.cumulative_metric === 'distance_m' || (titleMeters != null && titleMeters > 0));
  if (looksMeters) {
    const miles = Math.round((stored / 1609.34) * 100) / 100;
    if (miles >= 1) {
      return [newCumulativeMetric({ id: 'm1', target: miles, name: 'miles', unit: 'mi' })];
    }
  }
  return [newCumulativeMetric({ id: 'm1', target: stored, name: 'count', unit: null })];
}

export function resolveCumulativeMetrics(input: {
  metrics?: unknown;
  scoring_config?: unknown;
  cumulative_target?: string | number | null;
  cumulative_metric?: string | null;
  title?: string | null;
  task?: string | null;
  challenge_type?: string | null;
  format?: string | null;
}): CumulativeMetric[] {
  const fromColumn = parseCumulativeMetrics(input.metrics);
  if (fromColumn.length > 0) {
    return fromColumn;
  }
  const fromConfig = parseCumulativeMetrics(input.scoring_config);
  if (fromConfig.length > 0) {
    return fromConfig;
  }
  if (input.challenge_type === 'cumulative' || input.format === 'cumulative') {
    return metricsFromLegacyTarget(input);
  }
  return [];
}

export function serializeCumulativeMetrics(metrics: CumulativeMetric[]): CumulativeMetric[] {
  return metrics.slice(0, CUMULATIVE_METRIC_CAP).map((item, index) =>
    newCumulativeMetric({
      ...item,
      id: item.id || `m${index + 1}`,
    }),
  );
}

export function filledCumulativeMetrics(metrics: CumulativeMetric[] | null | undefined): CumulativeMetric[] {
  return (metrics ?? []).filter((item) => item.target > 0 && item.name.trim()).slice(0, CUMULATIVE_METRIC_CAP);
}

export function firstMetricLegacyTarget(metrics: CumulativeMetric[]): {
  cumulative_metric: 'distance_m' | 'count';
  cumulative_target: number;
} {
  const first = filledCumulativeMetrics(metrics)[0] ?? metrics[0];
  if (!first || first.target <= 0) {
    return { cumulative_metric: 'count', cumulative_target: 0 };
  }
  if (metricAllowsDecimals(first)) {
    const unit = first.unit === 'km' || metricUnitLabel(first) === 'km' ? 'km' : 'mi';
    return { cumulative_metric: 'distance_m', cumulative_target: amountToMeters(first.target, unit) };
  }
  return { cumulative_metric: 'count', cumulative_target: first.target };
}

export function formatMetricProgress(
  done: number,
  metric: Pick<CumulativeMetric, 'target' | 'name' | 'unit'>,
): string {
  const target = Math.max(Number(metric.target) || 0, 0);
  const have = Math.max(Number(done) || 0, 0);
  const unit = metricUnitLabel(metric);
  const print = (value: number) => {
    if (metricAllowsDecimals(metric)) {
      const rounded = Math.round(value * 100) / 100;
      return Number.isInteger(rounded) ? String(rounded) : String(rounded);
    }
    return String(Math.round(value));
  };
  return unit ? `${print(have)} / ${print(target)} ${unit}` : `${print(have)} / ${print(target)}`;
}

export function cumulativeMetricsProgressLabel(
  metrics: CumulativeMetric[],
  totals?: Record<string, number> | null,
): string {
  const rows = filledCumulativeMetrics(metrics);
  if (rows.length === 0) {
    return '';
  }
  return rows
    .map((metric) => formatMetricProgress(Number(totals?.[metric.id]) || 0, metric))
    .join(' · ');
}

export function allMetricsHit(
  metrics: CumulativeMetric[],
  totals?: Record<string, number> | null,
): boolean {
  const rows = filledCumulativeMetrics(metrics);
  if (rows.length === 0) {
    return false;
  }
  return rows.every((metric) => Math.max(Number(totals?.[metric.id]) || 0, 0) >= metric.target);
}

export function parseMetricTotals(raw: unknown): Record<string, number> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {};
  }
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const amount = Number(value);
    if (Number.isFinite(amount) && amount > 0) {
      out[key] = amount;
    }
  }
  return out;
}

export function winWindowOf(value: unknown): CumulativeWinWindow {
  return value === 'week' ? 'week' : 'challenge';
}
