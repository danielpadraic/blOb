export const COMPARABLE_POINTS_METHOD = 'comparable_points' as const;

export type ScoringMethod = typeof COMPARABLE_POINTS_METHOD;

export type ActivityMultiplierTier = {
  threshold: number;
  percent: number;
};

export type ActivityMultiplierConfig = {
  enabled: boolean;
  extra_factor: number;
  label?: string;
  tiers?: ActivityMultiplierTier[];
};

export type ActivityQualifier = {
  id: string;
  label: string;
};

export type ActivityQualifiersConfig = {
  enabled: boolean;
  items: ActivityQualifier[];
};

export type ActivityFloorConfig = {
  enabled: boolean;
  min_qty: number;
};

export type ActivityConfig = {
  id: string;
  name: string;
  unit: string;
  parity_qty: number;
  multiplier: ActivityMultiplierConfig;
  qualifiers: ActivityQualifiersConfig;
  floor?: ActivityFloorConfig;
};

export type ComparablePointsConfig = {
  version: number;
  parity_points: number;
  floor_master?: boolean;
  activities: ActivityConfig[];
};

export type ChallengeScoringAudit = {
  id: string;
  challenge_id: string;
  version: number;
  changed_by: string | null;
  changed_at: string;
  summary: string | null;
  config_snapshot: ComparablePointsConfig | null;
};

export const ACTIVITY_UNIT_PRESETS = ['minutes', 'miles', 'reps', 'sessions'] as const;

export const COMPARABLE_POINTS_SOFT_MAX = 4;
export const COMPARABLE_POINTS_HARD_MAX = 6;
export const DEFAULT_PARITY_POINTS = 10_000;
export const DEFAULT_MULTIPLIER_FACTOR = 0.5;

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyQualifier(): ActivityQualifier {
  return { id: newId('q'), label: '' };
}

export function emptyActivity(partial?: Partial<ActivityConfig>): ActivityConfig {
  const tiers = Array.isArray(partial?.multiplier?.tiers)
    ? partial.multiplier.tiers
        .map((item) => ({
          threshold: Number(item.threshold),
          percent: Number(item.percent),
        }))
        .filter((item) => Number.isFinite(item.threshold) && Number.isFinite(item.percent))
    : undefined;
  return {
    id: partial?.id ?? newId('act'),
    name: partial?.name ?? '',
    unit: partial?.unit ?? 'minutes',
    parity_qty: Number.isFinite(partial?.parity_qty) ? Number(partial?.parity_qty) : 0,
    multiplier: {
      enabled: Boolean(partial?.multiplier?.enabled),
      extra_factor: clampFactor(partial?.multiplier?.extra_factor ?? DEFAULT_MULTIPLIER_FACTOR),
      label: typeof partial?.multiplier?.label === 'string' ? partial.multiplier.label : undefined,
      tiers: tiers && tiers.length > 0 ? tiers : undefined,
    },
    qualifiers: {
      enabled: Boolean(partial?.qualifiers?.enabled),
      items:
        Array.isArray(partial?.qualifiers?.items) && partial.qualifiers.items.length > 0
          ? partial.qualifiers.items.map((item) => ({
              id: item.id || newId('q'),
              label: String(item.label ?? ''),
            }))
          : [emptyQualifier()],
    },
    floor: partial?.floor
      ? { enabled: Boolean(partial.floor.enabled), min_qty: asQty(partial.floor.min_qty) }
      : undefined,
  };
}

export function emptyComparablePointsConfig(): ComparablePointsConfig {
  return {
    version: 1,
    parity_points: DEFAULT_PARITY_POINTS,
    activities: [emptyActivity()],
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function clampFactor(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return DEFAULT_MULTIPLIER_FACTOR;
  }
  return Math.min(4, Math.max(0.1, Math.round(n * 100) / 100));
}

function asQty(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) {
    return 0;
  }
  return Math.round(n * 100) / 100;
}

export function asScoringVersion(value: unknown, fallback = 1): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n) || n < 1) {
    return fallback;
  }
  return n;
}

function parseActivity(value: unknown): ActivityConfig | null {
  const row = asRecord(value);
  if (!row) {
    return null;
  }
  const multiplierRow = asRecord(row.multiplier);
  const qualifiersRow = asRecord(row.qualifiers);
  const itemsRaw = Array.isArray(qualifiersRow?.items)
    ? qualifiersRow.items
    : Array.isArray(row.qualifier_items)
      ? row.qualifier_items
      : [];
  const floorRow = asRecord(row.floor);
  return emptyActivity({
    id: typeof row.id === 'string' && row.id ? row.id : newId('act'),
    name: typeof row.name === 'string' ? row.name : '',
    unit: typeof row.unit === 'string' && row.unit.trim() ? row.unit.trim() : 'minutes',
    parity_qty: asQty(row.parity_qty),
    multiplier: {
      enabled: Boolean(multiplierRow?.enabled ?? row.multiplier_enabled),
      extra_factor: clampFactor(multiplierRow?.extra_factor ?? row.extra_factor),
      label: typeof multiplierRow?.label === 'string' ? multiplierRow.label : undefined,
      tiers: Array.isArray(multiplierRow?.tiers)
        ? multiplierRow.tiers
            .map((item) => {
              const rec = asRecord(item);
              if (!rec) {
                return { threshold: NaN, percent: NaN };
              }
              return { threshold: Number(rec.threshold), percent: Number(rec.percent) };
            })
            .filter((item) => Number.isFinite(item.threshold) && Number.isFinite(item.percent))
        : undefined,
    },
    qualifiers: {
      enabled: Boolean(qualifiersRow?.enabled ?? row.qualifiers_enabled),
      items: itemsRaw
        .map((item) => {
          if (typeof item === 'string') {
            const label = item.trim();
            return label ? { id: newId('q'), label } : null;
          }
          const rec = asRecord(item);
          if (!rec) {
            return null;
          }
          return {
            id: typeof rec.id === 'string' && rec.id ? rec.id : newId('q'),
            label: typeof rec.label === 'string' ? rec.label : String(rec.text ?? ''),
          };
        })
        .filter((item): item is ActivityQualifier => item != null),
    },
    floor: floorRow
      ? { enabled: Boolean(floorRow.enabled), min_qty: asQty(floorRow.min_qty) }
      : undefined,
  });
}

export function parseComparablePointsConfig(value: unknown): ComparablePointsConfig | null {
  const row = asRecord(value);
  if (!row) {
    return null;
  }
  const activities = (Array.isArray(row.activities) ? row.activities : [])
    .map(parseActivity)
    .filter((item): item is ActivityConfig => item != null);
  if (activities.length < 1) {
    return null;
  }
  const parity = Number(row.parity_points);
  return {
    version: asScoringVersion(row.version, 1),
    parity_points: Number.isFinite(parity) && parity > 0 ? Math.round(parity) : DEFAULT_PARITY_POINTS,
    floor_master: Boolean(row.floor_master),
    activities: activities.slice(0, COMPARABLE_POINTS_HARD_MAX),
  };
}

export function cloneComparablePointsConfig(config: ComparablePointsConfig): ComparablePointsConfig {
  return {
    version: asScoringVersion(config.version, 1),
    parity_points: config.parity_points,
    floor_master: Boolean(config.floor_master),
    activities: config.activities.map((activity) => emptyActivity(activity)),
  };
}

export function filledComparableActivities(config: ComparablePointsConfig): ActivityConfig[] {
  return config.activities.filter((activity) => activity.name.trim().length > 0 && activity.parity_qty > 0);
}

export function validateComparablePointsConfig(
  config: ComparablePointsConfig,
): { ok: true; config: ComparablePointsConfig } | { ok: false; message: string } {
  const parity = Math.round(Number(config.parity_points) || 0);
  if (parity < 1) {
    return { ok: false, message: 'Set how many points a full-value activity is worth.' };
  }
  const activities = config.activities
    .map((activity) =>
      emptyActivity({
        ...activity,
        name: activity.name.trim(),
        unit: activity.unit.trim() || 'units',
        parity_qty: asQty(activity.parity_qty),
        qualifiers: {
          enabled: activity.qualifiers.enabled,
          items: activity.qualifiers.items
            .map((item) => ({ ...item, label: item.label.trim() }))
            .filter((item) => item.label.length > 0),
        },
      }),
    )
    .filter((activity) => activity.name.length > 0);
  if (!activities.some((activity) => activity.parity_qty > 0)) {
    return { ok: false, message: 'Name at least one activity and set a full-value quantity.' };
  }
  return {
    ok: true,
    config: {
      version: asScoringVersion(config.version, 1),
      parity_points: parity,
      floor_master: Boolean(config.floor_master),
      activities,
    },
  };
}

export function comparablePointsFromChallenge(challenge: {
  comparable_points_config?: unknown;
  scoring_config?: unknown;
  scoring_method?: string | null;
} | null | undefined): ComparablePointsConfig | null {
  if (!challenge) {
    return null;
  }
  return (
    parseComparablePointsConfig(challenge.comparable_points_config) ??
    parseComparablePointsConfig(challenge.scoring_config)
  );
}

export function currentScoringVersion(challenge: {
  scoring_version?: number | null;
  comparable_points_config?: unknown;
  scoring_config?: unknown;
} | null | undefined): number {
  const config = comparablePointsFromChallenge(challenge);
  return Math.max(asScoringVersion(challenge?.scoring_version, 1), asScoringVersion(config?.version, 1));
}

export function nextScoringVersion(challenge: {
  scoring_version?: number | null;
  comparable_points_config?: unknown;
  scoring_config?: unknown;
} | null | undefined): number {
  if (!comparablePointsFromChallenge(challenge)) {
    return 1;
  }
  return currentScoringVersion(challenge) + 1;
}

export function withScoringVersion(
  config: ComparablePointsConfig,
  version: number,
): ComparablePointsConfig {
  return { ...cloneComparablePointsConfig(config), version: asScoringVersion(version, 1) };
}

export function diffComparablePoints(
  before: ComparablePointsConfig | null,
  after: ComparablePointsConfig,
): string[] {
  if (!before) {
    return [`New scoring method · ${comparablePointsHeadline(after)}`];
  }
  const lines: string[] = [];
  if (before.parity_points !== after.parity_points) {
    lines.push(
      `Full-value points ${formatPoints(before.parity_points)} → ${formatPoints(after.parity_points)}`,
    );
  }
  const beforeById = new Map(before.activities.map((item) => [item.id, item]));
  const afterIds = new Set(after.activities.map((item) => item.id));
  for (const activity of after.activities) {
    const prev = beforeById.get(activity.id);
    const name = activity.name.trim() || 'Untitled activity';
    if (!prev) {
      lines.push(`Added ${name} · ${activityQtyLabel(activity)}`);
      continue;
    }
    if (prev.name.trim() !== activity.name.trim()) {
      lines.push(`Renamed ${prev.name.trim() || 'Untitled'} → ${name}`);
    }
    if (prev.unit !== activity.unit || prev.parity_qty !== activity.parity_qty) {
      lines.push(`${name} full value ${activityQtyLabel(prev)} → ${activityQtyLabel(activity)}`);
    }
    if (prev.multiplier.enabled !== activity.multiplier.enabled) {
      lines.push(`${name} multiplier ${activity.multiplier.enabled ? 'on' : 'off'}`);
    } else if (
      activity.multiplier.enabled &&
      prev.multiplier.extra_factor !== activity.multiplier.extra_factor
    ) {
      lines.push(
        `${name} extra-work factor ${prev.multiplier.extra_factor} → ${activity.multiplier.extra_factor}`,
      );
    }
    if (prev.qualifiers.enabled !== activity.qualifiers.enabled) {
      lines.push(`${name} qualifiers ${activity.qualifiers.enabled ? 'on' : 'off'}`);
    }
  }
  for (const activity of before.activities) {
    if (!afterIds.has(activity.id)) {
      lines.push(`Removed ${activity.name.trim() || 'Untitled activity'}`);
    }
  }
  if (lines.length === 0) {
    lines.push('No scoring rule changes.');
  }
  return lines;
}

export function isComparablePointsMethod(
  method: string | null | undefined,
  config: unknown,
): config is ComparablePointsConfig {
  return method === COMPARABLE_POINTS_METHOD && parseComparablePointsConfig(config) != null;
}

export function formatPoints(value: number): string {
  return Math.round(Number(value) || 0).toLocaleString('en-US');
}

export function formatQty(value: number): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return '0';
  }
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

export function activityQtyLabel(activity: Pick<ActivityConfig, 'parity_qty' | 'unit'>): string {
  const unit = activity.unit.trim() || 'units';
  return `${formatQty(activity.parity_qty)} ${unit}`;
}

export function comparablePointsHeadline(config: ComparablePointsConfig): string {
  const count = filledComparableActivities(config).length || config.activities.length;
  return `${count} ${count === 1 ? 'activity' : 'activities'} · ${formatPoints(config.parity_points)} pts at full value`;
}

export function comparablePointsLiveSentence(config: ComparablePointsConfig): string {
  const named = filledComparableActivities(config);
  const pts = `${formatPoints(config.parity_points)} pts`;
  if (named.length === 0) {
    return 'Name an activity and set the quantity that equals full value.';
  }
  const parts = named.map((activity) => `${activityQtyLabel(activity)} of ${activity.name.trim()} equals ${pts}`);
  if (parts.length === 1) {
    return `${parts[0]}.`;
  }
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}.`;
}

export function scoreSampleActivity(
  config: Pick<ComparablePointsConfig, 'parity_points'>,
  activity: ActivityConfig,
  qty: number,
  qualifierMet = true,
): number {
  if (activity.qualifiers.enabled && !qualifierMet) {
    return 0;
  }
  const amount = asQty(qty);
  if (activity.parity_qty <= 0 || amount <= 0) {
    return 0;
  }
  const ratio = amount / activity.parity_qty;
  if (ratio <= 1 || !activity.multiplier.enabled) {
    return Math.round(Math.min(ratio, 1) * config.parity_points);
  }
  return Math.round(
    config.parity_points + (ratio - 1) * config.parity_points * clampFactor(activity.multiplier.extra_factor),
  );
}
