import {
  isFitnessOfficialChallenge,
  usesPointsBoard,
  usesTotalCountCheckins,
} from '@/lib/challengeExperience';
import {
  challengeDurationDays,
  pointsGoalTarget,
  storedDurationDays,
} from '@/lib/challengeGoal';
import { displayDistance, type DistanceUnit } from '@/lib/distance';
import {
  formatMetricProgress,
  loggedMetricAmount,
  newCumulativeMetric,
  parseCumulativeMetrics,
  type CumulativeMetric,
} from '@/lib/cumulativeMetrics';
import { officialCoinKind, officialCoinToFinishLabel } from '@/lib/officialCoin';

/** Where the shared progress line is printed. */
export type ProgressSurface = 'overview' | 'rail' | 'lobby';

export type ProgressChallenge = {
  is_official?: boolean | null;
  official_kind?: string | null;
  series_id?: string | null;
  category?: string | null;
  challenge_type?: string | null;
  format?: string | null;
  is_unlimited?: boolean | null;
  days_required?: number | null;
  duration_days?: number | null;
  target_count?: number | null;
  length_value?: number | null;
  length_unit?: string | null;
  starts_at?: string | null;
  ends_at?: string | null;
  frequency?: string | null;
  scoring_method?: string | null;
  scoring_config?: unknown;
  comparable_points_config?: unknown;
  cumulative_target?: number | string | null;
  cumulative_metric?: string | null;
  cumulative_window?: string | null;
  win_window?: string | null;
  metrics?: unknown;
  tasks?: unknown;
  extra_tasks?: unknown;
  title?: string | null;
  task?: string | null;
  privacy_mode?: string | null;
  challenge_lane?: string | null;
};

export type ProgressExtras = {
  daysCompleted?: number;
  distanceMetersCompleted?: number;
  pointsCompleted?: number;
  metricTotals?: Record<string, number> | null;
  unit?: DistanceUnit;
  /** Points / honor rail only. Quantity and consistency ignore this. */
  latestActivity?: string | null;
};

const QUANTITY_FORMATS = new Set(['cumulative', 'distance', 'goal', 'quantity']);

function formatKey(value: string | null | undefined): string {
  return String(value ?? '').trim().toLowerCase();
}

function isQuantityFormat(challenge: ProgressChallenge | null | undefined): boolean {
  if (!challenge) {
    return false;
  }
  return QUANTITY_FORMATS.has(formatKey(challenge.format)) || QUANTITY_FORMATS.has(formatKey(challenge.challenge_type));
}

function usableMetrics(rows: CumulativeMetric[]): CumulativeMetric[] {
  return rows
    .filter((row) => row.target > 0 && (row.name.trim() || row.unit === 'mi' || row.unit === 'km'))
    .map((row) => (row.name.trim() ? row : { ...row, name: row.unit === 'km' ? 'km' : 'mi' }));
}

/** Quantity sitting on a task row: target + unit. Never the task title. */
function metricsFromTaskRows(raw: unknown): CumulativeMetric[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: CumulativeMetric[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as Record<string, unknown>;
    const target = Number(row.target ?? row.goal_quantity ?? row.quantity);
    if (!(target > 0)) {
      continue;
    }
    const unit = row.unit === 'km' || row.unit === 'mi' ? row.unit : null;
    const name = String(row.unit_name ?? row.metric ?? row.goal_unit ?? '').trim();
    if (!unit && !name) {
      continue;
    }
    out.push(
      newCumulativeMetric({
        id: typeof row.id === 'string' && row.id.trim() ? row.id : `t${out.length + 1}`,
        target,
        name: name || (unit === 'km' ? 'km' : 'miles'),
        unit,
      }),
    );
  }
  return usableMetrics(out);
}

/**
 * Saved quantity goal. Metrics column, then scoring_config, then extra tasks,
 * then cumulative_target. The title is never read.
 */
export function storedQuantityMetrics(
  challenge: ProgressChallenge | null | undefined,
  unitHint?: DistanceUnit,
): CumulativeMetric[] {
  if (!challenge) {
    return [];
  }
  const fromColumn = usableMetrics(parseCumulativeMetrics(challenge.metrics));
  if (fromColumn.length > 0) {
    return fromColumn;
  }
  const fromConfig = usableMetrics(parseCumulativeMetrics(challenge.scoring_config));
  if (fromConfig.length > 0) {
    return fromConfig;
  }
  const fromTasks = metricsFromTaskRows(challenge.extra_tasks ?? challenge.tasks);
  if (fromTasks.length > 0) {
    return fromTasks;
  }
  if (!isQuantityFormat(challenge)) {
    return [];
  }
  const stored = Number(challenge.cumulative_target);
  if (!(stored > 0)) {
    return [];
  }
  if (challenge.cumulative_metric === 'distance_m') {
    const unit: DistanceUnit = unitHint === 'km' ? 'km' : 'mi';
    const display = Math.round(displayDistance(stored, unit) * 100) / 100;
    if (display > 0) {
      return [
        newCumulativeMetric({
          id: 'm1',
          target: display,
          name: unit === 'km' ? 'km' : 'miles',
          unit,
        }),
      ];
    }
  }
  return [newCumulativeMetric({ id: 'm1', target: stored, name: '', unit: null })];
}

export function isStoredQuantityChallenge(challenge: ProgressChallenge | null | undefined): boolean {
  return storedQuantityMetrics(challenge).length > 0 || isQuantityFormat(challenge);
}

type ProgressKind = 'official' | 'quantity' | 'points' | 'total' | 'unlimited' | 'consistency';

function progressKind(challenge: ProgressChallenge): ProgressKind {
  if (officialCoinKind(challenge) || isFitnessOfficialChallenge(challenge) || challenge.is_official) {
    return 'official';
  }
  if (storedQuantityMetrics(challenge).length > 0 || isQuantityFormat(challenge)) {
    return 'quantity';
  }
  if (usesPointsBoard(challenge)) {
    return 'points';
  }
  if (usesTotalCountCheckins(challenge)) {
    return 'total';
  }
  if (challenge.is_unlimited) {
    return 'unlimited';
  }
  return 'consistency';
}

function quantityLine(challenge: ProgressChallenge, extras?: ProgressExtras): string {
  const metrics = storedQuantityMetrics(challenge, extras?.unit);
  const primary = metrics[0];
  if (!primary || !(primary.target > 0)) {
    return '';
  }
  const logged = loggedMetricAmount(primary, extras?.metricTotals, extras?.distanceMetersCompleted ?? 0);
  return formatMetricProgress(logged, primary);
}

function pointsLine(challenge: ProgressChallenge, extras: ProgressExtras | undefined, surface: ProgressSurface): string {
  const activity = String(extras?.latestActivity ?? '').trim();
  if (surface === 'rail' && activity) {
    return activity;
  }
  const comparable = challenge.scoring_method === 'comparable_points';
  const target = comparable ? 0 : pointsGoalTarget(challenge);
  const done = Math.max(Number(extras?.pointsCompleted) || 0, 0);
  if (target > 0) {
    return `${done} / ${target} pts`;
  }
  if (done > 0) {
    return `${done} pts`;
  }
  if (surface === 'rail') {
    return '';
  }
  return 'Score Points';
}

function consistencyLine(
  challenge: ProgressChallenge,
  extras: ProgressExtras | undefined,
  surface: ProgressSurface,
): string {
  const target = storedDurationDays(challenge);
  const done = Math.max(Math.floor(Number(extras?.daysCompleted) || 0), 0);
  if (target == null || target <= 0) {
    if (surface === 'rail') {
      return '';
    }
    return `${done} day${done === 1 ? '' : 's'}`;
  }
  return `${done} / ${target} days`;
}

/**
 * One progress line for Home, Overview, and Lobby.
 * Format and saved goal fields decide the words. The title is not read.
 */
export function challengeProgressLine(
  challenge: ProgressChallenge | null | undefined,
  extras?: ProgressExtras,
  surface: ProgressSurface = 'overview',
): string {
  if (!challenge) {
    return '';
  }
  const kind = progressKind(challenge);
  if (kind === 'official') {
    if (surface === 'rail') {
      return '';
    }
    if (officialCoinKind(challenge)) {
      return officialCoinToFinishLabel(challenge) || `${challengeDurationDays(challenge)}-Day Consistency`;
    }
    if (isFitnessOfficialChallenge(challenge)) {
      return `${challengeDurationDays(challenge)}-Day Consistency`;
    }
    return `${challengeDurationDays(challenge)}-day challenge`;
  }
  if (kind === 'quantity') {
    const line = quantityLine(challenge, extras);
    if (line) {
      return line;
    }
    return surface === 'rail' ? '' : 'Distance';
  }
  if (kind === 'points') {
    return pointsLine(challenge, extras, surface);
  }
  if (kind === 'total') {
    const target = Math.max(Math.floor(Number(challenge.target_count) || 1), 1);
    const done = Math.max(Math.floor(Number(extras?.daysCompleted) || 0), 0);
    return `${done} of ${target} Check-Ins`;
  }
  if (kind === 'unlimited') {
    const logs = Math.max(Math.floor(Number(extras?.daysCompleted) || 0), 0);
    if (surface === 'rail' && logs <= 0) {
      return '';
    }
    return `${logs} check-in${logs === 1 ? '' : 's'}`;
  }
  return consistencyLine(challenge, extras, surface);
}

export function challengeProgressRatio(
  challenge: ProgressChallenge | null | undefined,
  extras?: ProgressExtras,
): number {
  if (!challenge) {
    return 0;
  }
  const kind = progressKind(challenge);
  if (kind === 'quantity') {
    const primary = storedQuantityMetrics(challenge, extras?.unit)[0];
    if (!primary || !(primary.target > 0)) {
      return 0;
    }
    const logged = loggedMetricAmount(primary, extras?.metricTotals, extras?.distanceMetersCompleted ?? 0);
    return Math.min(Math.max(logged, 0) / primary.target, 1);
  }
  if (kind === 'consistency') {
    const target = storedDurationDays(challenge);
    if (!target) {
      return 0;
    }
    const done = Math.max(Math.floor(Number(extras?.daysCompleted) || 0), 0);
    return Math.min(done / target, 1);
  }
  if (kind === 'total') {
    const target = Math.max(Math.floor(Number(challenge.target_count) || 1), 1);
    const done = Math.max(Math.floor(Number(extras?.daysCompleted) || 0), 0);
    return Math.min(done / target, 1);
  }
  if (kind === 'points') {
    const target = pointsGoalTarget(challenge);
    if (target <= 0) {
      return 0;
    }
    const done = Math.max(Number(extras?.pointsCompleted) || 0, 0);
    return Math.min(done / target, 1);
  }
  return 0;
}

export type SavedGoalFields = {
  cumulative_metric: string | null;
  cumulative_target: number | null;
  cumulative_window: string | null;
  win_window: string | null;
  metrics: CumulativeMetric[];
};

type GoalSaveValues = {
  challenge_type?: string | null;
  format?: string | null;
  cumulative_metric?: string | null;
  cumulative_target?: string | number | null;
  cumulative_window?: string | null;
  win_window?: string | null;
  metrics?: unknown;
};

function sameGoalFamily(left: string, right: string): boolean {
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  return QUANTITY_FORMATS.has(left) && QUANTITY_FORMATS.has(right);
}

/**
 * Cover-only edits keep the saved target and unit.
 * Switching the format away from a quantity goal clears it.
 */
export function goalFieldsForSave(
  values: GoalSaveValues,
  existing: GoalSaveValues | null | undefined,
): SavedGoalFields {
  const nextFormat = formatKey(values.format || values.challenge_type);
  const prevFormat = formatKey(existing?.format || existing?.challenge_type);
  const formatChanged = Boolean(nextFormat) && Boolean(prevFormat) && !sameGoalFamily(nextFormat, prevFormat);
  const formMetrics = usableMetrics(parseCumulativeMetrics(values.metrics));
  const formTarget = Math.max(Number(values.cumulative_target) || 0, 0);
  const formQuantity = QUANTITY_FORMATS.has(nextFormat);
  const existingMetrics = usableMetrics(parseCumulativeMetrics(existing?.metrics));
  const existingTarget = Math.max(Number(existing?.cumulative_target) || 0, 0);
  const existingHas = existingMetrics.length > 0 || existingTarget > 0;
  const window =
    (typeof values.win_window === 'string' && values.win_window) ||
    (typeof values.cumulative_window === 'string' && values.cumulative_window) ||
    (typeof existing?.win_window === 'string' && existing.win_window) ||
    (typeof existing?.cumulative_window === 'string' && existing.cumulative_window) ||
    null;

  if ((formMetrics.length > 0 || (formQuantity && formTarget > 0)) && (formQuantity || !formatChanged)) {
    const primary = formMetrics[0];
    return {
      cumulative_metric:
        (typeof values.cumulative_metric === 'string' && values.cumulative_metric) ||
        (typeof existing?.cumulative_metric === 'string' && existing.cumulative_metric) ||
        (primary && (primary.unit === 'mi' || primary.unit === 'km') ? 'distance_m' : 'count'),
      cumulative_target: formTarget > 0 ? formTarget : primary?.target ?? null,
      cumulative_window: window,
      win_window: window,
      metrics: formMetrics.length > 0 ? formMetrics : parseCumulativeMetrics(values.metrics),
    };
  }

  if (existingHas && !formatChanged) {
    return {
      cumulative_metric: typeof existing?.cumulative_metric === 'string' ? existing.cumulative_metric : null,
      cumulative_target: existingTarget > 0 ? existingTarget : existingMetrics[0]?.target ?? null,
      cumulative_window: window,
      win_window: window,
      metrics: existingMetrics,
    };
  }

  if (!formQuantity) {
    return {
      cumulative_metric: null,
      cumulative_target: null,
      cumulative_window: null,
      win_window: null,
      metrics: [],
    };
  }

  return {
    cumulative_metric: typeof existing?.cumulative_metric === 'string' ? existing.cumulative_metric : null,
    cumulative_target: existingTarget > 0 ? existingTarget : null,
    cumulative_window: window,
    win_window: window,
    metrics: existingMetrics,
  };
}

/** Edit form format. A stored quantity goal stays cumulative so a cover save can write it back. */
export function editFormatFromChallenge(challenge: ProgressChallenge | null | undefined): string | null {
  const format = formatKey(challenge?.format);
  const known = format === 'lms' || format === 'points' || format === 'cumulative' || format === 'consistency';
  if (format === 'consistency' && storedQuantityMetrics(challenge).length > 0) {
    return 'cumulative';
  }
  if (known) {
    return format;
  }
  if (
    QUANTITY_FORMATS.has(format) ||
    formatKey(challenge?.challenge_type) === 'cumulative' ||
    storedQuantityMetrics(challenge).length > 0
  ) {
    return 'cumulative';
  }
  return null;
}
