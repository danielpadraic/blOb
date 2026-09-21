export const COMPARABLE_POINTS_METHOD = 'comparable_points' as const;
export const COMPARABLE_CHECKIN_EMPTY_CAPTION = 'Check-in Complete';

export type ScoringMethod = typeof COMPARABLE_POINTS_METHOD;

export type LogInputKind = 'count' | 'decimal' | 'money';

export type ScoreWindow = 'challenge' | 'period' | 'day';

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

export type ScoringLane = {
  id: string;
  label: string;
};

export type ActivityConfig = {
  id: string;
  name: string;
  unit: string;
  parity_qty: number;
  input_kind?: LogInputKind;
  lane_ids?: string[];
  multiplier: ActivityMultiplierConfig;
  qualifiers: ActivityQualifiersConfig;
  floor?: ActivityFloorConfig;
};

export type LogTextField = {
  id: string;
  label: string;
  placeholder?: string;
  required?: boolean;
};

export type LogChoiceField = {
  id: string;
  label: string;
  options: string[];
};

export type ComparablePointsConfig = {
  version: number;
  parity_points: number;
  window?: ScoreWindow;
  extras_keep_adding?: boolean;
  floor_master?: boolean;
  lanes?: ScoringLane[];
  activities: ActivityConfig[];
  text_fields?: LogTextField[];
  choice_fields?: LogChoiceField[];
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
export const LOG_INPUT_KINDS: LogInputKind[] = ['count', 'decimal', 'money'];
export const SCORE_WINDOWS: ScoreWindow[] = ['challenge', 'period', 'day'];

export const COMPARABLE_POINTS_SOFT_MAX = 4;
export const COMPARABLE_POINTS_HARD_MAX = 6;
export const LOG_TEXT_FIELD_MAX = 3;
export const LOG_CHOICE_FIELD_MAX = 2;
export const LOG_CHOICE_OPTION_MIN = 2;
export const LOG_CHOICE_OPTION_MAX = 8;
export const DEFAULT_PARITY_POINTS = 10_000;
export const DEFAULT_MULTIPLIER_FACTOR = 1;
export const LOG_CHOICES_PART_KEY = 'log_choices';

export type ComparableLogNumericField = {
  kind: 'activity' | 'multiplier';
  key: string;
  label: string;
  inputKind: LogInputKind;
  unit: string;
};

export type ComparableLogTextField = LogTextField & { kind: 'text' };
export type ComparableLogChoiceField = LogChoiceField & { kind: 'choice' };
export type ComparableLogField =
  | ComparableLogNumericField
  | ComparableLogTextField
  | ComparableLogChoiceField;

export type ComparableBoardColumn = {
  key: string;
  label: string;
  money: boolean;
};

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyQualifier(): ActivityQualifier {
  return { id: newId('q'), label: '' };
}

export function emptyLogTextField(partial?: Partial<LogTextField>): LogTextField {
  return {
    id: partial?.id ?? newId('txt'),
    label: typeof partial?.label === 'string' ? partial.label : '',
    placeholder: typeof partial?.placeholder === 'string' ? partial.placeholder : undefined,
    required: Boolean(partial?.required),
  };
}

export function emptyLogChoiceField(partial?: Partial<LogChoiceField>): LogChoiceField {
  const options = Array.isArray(partial?.options)
    ? partial.options.map((item) => String(item ?? '').trim()).filter(Boolean)
    : [];
  return {
    id: partial?.id ?? newId('choice'),
    label: typeof partial?.label === 'string' ? partial.label : '',
    options: options.length > 0 ? options : ['', ''],
  };
}

export function inferInputKind(unit: string, explicit?: LogInputKind | null): LogInputKind {
  if (explicit === 'count' || explicit === 'decimal' || explicit === 'money') {
    return explicit;
  }
  const lower = unit.trim().toLowerCase();
  if (lower === 'usd' || lower === '$' || lower === 'money') {
    return 'money';
  }
  return 'count';
}

export function inferScoreWindow(value: unknown): ScoreWindow {
  return value === 'period' || value === 'day' ? value : 'challenge';
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseLaneIds(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const ids = value.map((item) => String(item ?? '').trim()).filter(Boolean);
  return ids.length > 0 ? ids : undefined;
}

function parseLanes(value: unknown): ScoringLane[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const lanes = value
    .map((item) => {
      const row = asRecord(item);
      if (!row) {
        return null;
      }
      const id = typeof row.id === 'string' ? row.id.trim() : '';
      const label = typeof row.label === 'string' ? row.label.trim() : '';
      if (!id || !label) {
        return null;
      }
      return { id, label };
    })
    .filter((item): item is ScoringLane => item != null);
  return lanes.length > 0 ? lanes : undefined;
}

function asExtraFactor(value: unknown, fallback = DEFAULT_MULTIPLIER_FACTOR): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(4, Math.max(0, Math.round(n * 100) / 100));
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

export function parseMoneyInput(raw: string): number {
  const cleaned = String(raw ?? '')
    .replace(/[^0-9.]/g, '')
    .trim();
  if (!cleaned || cleaned === '.') {
    return 0;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : 0;
}

export function formatMoneyAmount(value: number): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) {
    return '$0';
  }
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
}

/** Mechanics sentence: “$13,000” not “$13,000.00” or “13000 USD”. */
export function formatMoneySentenceAmount(value: number): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) {
    return '$0';
  }
  const whole = Number.isInteger(n);
  return n.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: whole ? 0 : 2,
    minimumFractionDigits: whole ? 0 : 2,
  });
}

export function slugMetricLabel(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function multiplierMetricKey(label: string): string {
  const slug = slugMetricLabel(label);
  return slug ? `multiplier:${slug}` : '';
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
  const unit =
    typeof partial?.unit === 'string' && partial.unit.trim()
      ? partial.unit.trim()
      : partial
        ? ''
        : 'minutes';
  return {
    id: partial?.id ?? newId('act'),
    name: partial?.name ?? '',
    unit,
    parity_qty: Number.isFinite(partial?.parity_qty) ? Number(partial?.parity_qty) : 0,
    input_kind: inferInputKind(unit, partial?.input_kind),
    lane_ids: parseLaneIds(partial?.lane_ids),
    multiplier: {
      enabled: Boolean(partial?.multiplier?.enabled),
      extra_factor: asExtraFactor(partial?.multiplier?.extra_factor ?? DEFAULT_MULTIPLIER_FACTOR),
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
    window: 'challenge',
    extras_keep_adding: true,
    activities: [emptyActivity()],
    text_fields: [],
    choice_fields: [],
  };
}

function parseTextField(value: unknown): LogTextField | null {
  const row = asRecord(value);
  if (!row) {
    return null;
  }
  const label = typeof row.label === 'string' ? row.label.trim() : '';
  if (!label) {
    return null;
  }
  return emptyLogTextField({
    id: typeof row.id === 'string' && row.id ? row.id : newId('txt'),
    label,
    placeholder: typeof row.placeholder === 'string' ? row.placeholder : undefined,
    required: Boolean(row.required),
  });
}

function parseChoiceField(value: unknown): LogChoiceField | null {
  const row = asRecord(value);
  if (!row) {
    return null;
  }
  const label = typeof row.label === 'string' ? row.label.trim() : '';
  const options = Array.isArray(row.options)
    ? row.options.map((item) => String(item ?? '').trim()).filter(Boolean)
    : [];
  if (!label || options.length < 1) {
    return null;
  }
  return {
    id: typeof row.id === 'string' && row.id ? row.id : newId('choice'),
    label,
    options,
  };
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
  const unit = typeof row.unit === 'string' && row.unit.trim() ? row.unit.trim() : '';
  const explicitKind =
    row.input_kind === 'count' || row.input_kind === 'decimal' || row.input_kind === 'money'
      ? row.input_kind
      : undefined;
  return emptyActivity({
    id: typeof row.id === 'string' && row.id ? row.id : newId('act'),
    name: typeof row.name === 'string' ? row.name : '',
    unit,
    parity_qty: asQty(row.parity_qty),
    input_kind: inferInputKind(unit, explicitKind),
    lane_ids: parseLaneIds(row.lane_ids),
    multiplier: {
      enabled: Boolean(multiplierRow?.enabled ?? row.multiplier_enabled),
      extra_factor: asExtraFactor(multiplierRow?.extra_factor ?? row.extra_factor),
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
  const text_fields = (Array.isArray(row.text_fields) ? row.text_fields : [])
    .map(parseTextField)
    .filter((item): item is LogTextField => item != null)
    .slice(0, LOG_TEXT_FIELD_MAX);
  const choice_fields = (Array.isArray(row.choice_fields) ? row.choice_fields : [])
    .map(parseChoiceField)
    .filter((item): item is LogChoiceField => item != null)
    .slice(0, LOG_CHOICE_FIELD_MAX);
  return {
    version: asScoringVersion(row.version, 1),
    parity_points: Number.isFinite(parity) && parity > 0 ? Math.round(parity) : DEFAULT_PARITY_POINTS,
    window: inferScoreWindow(row.window),
    extras_keep_adding: row.extras_keep_adding === false ? false : true,
    floor_master: Boolean(row.floor_master),
    lanes: parseLanes(row.lanes),
    activities: activities.slice(0, COMPARABLE_POINTS_HARD_MAX),
    text_fields,
    choice_fields,
  };
}

export function cloneComparablePointsConfig(config: ComparablePointsConfig): ComparablePointsConfig {
  return {
    version: asScoringVersion(config.version, 1),
    parity_points: config.parity_points,
    window: inferScoreWindow(config.window),
    extras_keep_adding: config.extras_keep_adding === false ? false : true,
    floor_master: Boolean(config.floor_master),
    lanes: parseLanes(config.lanes),
    activities: config.activities.map((activity) => emptyActivity(activity)),
    text_fields: (config.text_fields ?? []).map((field) => emptyLogTextField(field)),
    choice_fields: (config.choice_fields ?? []).map((field) => emptyLogChoiceField(field)),
  };
}

export function filledComparableActivities(config: ComparablePointsConfig): ActivityConfig[] {
  return config.activities.filter((activity) => activity.name.trim().length > 0 && activity.parity_qty > 0);
}

export function extrasKeepAddingFor(
  activity: ActivityConfig,
  config?: Pick<ComparablePointsConfig, 'extras_keep_adding'>,
): boolean {
  if (activity.multiplier.extra_factor === 0) {
    return false;
  }
  if (activity.multiplier.extra_factor === 1) {
    return true;
  }
  return config?.extras_keep_adding !== false;
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
        unit: activity.unit.trim() || (activity.input_kind === 'money' ? 'USD' : 'units'),
        parity_qty: asQty(activity.parity_qty),
        input_kind: inferInputKind(activity.unit, activity.input_kind),
        multiplier: {
          ...activity.multiplier,
          extra_factor: extrasKeepAddingFor(activity, config) ? 1 : 0,
          label: activity.multiplier.label?.trim() || undefined,
        },
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
  const text_fields = (config.text_fields ?? [])
    .map((field) => emptyLogTextField({ ...field, label: field.label.trim() }))
    .filter((field) => field.label.length > 0)
    .slice(0, LOG_TEXT_FIELD_MAX);
  const choice_fields: LogChoiceField[] = [];
  for (const field of config.choice_fields ?? []) {
    const label = field.label.trim();
    const options: string[] = [];
    const seen = new Set<string>();
    for (const option of field.options ?? []) {
      const next = String(option ?? '').trim();
      if (!next) {
        continue;
      }
      const key = next.toLowerCase();
      if (seen.has(key)) {
        return { ok: false, message: `Each choice under “${label || 'a choice field'}” needs a unique option.` };
      }
      seen.add(key);
      options.push(next);
    }
    if (!label) {
      continue;
    }
    if (options.length < LOG_CHOICE_OPTION_MIN) {
      return { ok: false, message: `“${label}” needs at least two options.` };
    }
    if (options.length > LOG_CHOICE_OPTION_MAX) {
      return { ok: false, message: `Keep “${label}” to ${LOG_CHOICE_OPTION_MAX} options.` };
    }
    choice_fields.push({
      id: field.id || newId('choice'),
      label,
      options,
    });
    if (choice_fields.length >= LOG_CHOICE_FIELD_MAX) {
      break;
    }
  }
  return {
    ok: true,
    config: {
      version: asScoringVersion(config.version, 1),
      parity_points: parity,
      window: inferScoreWindow(config.window),
      extras_keep_adding: config.extras_keep_adding === false ? false : true,
      floor_master: Boolean(config.floor_master),
      lanes: parseLanes(config.lanes),
      activities,
      text_fields,
      choice_fields,
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
  if (inferScoreWindow(before.window) !== inferScoreWindow(after.window)) {
    lines.push(`Score window ${inferScoreWindow(before.window)} → ${inferScoreWindow(after.window)}`);
  }
  if ((before.extras_keep_adding !== false) !== (after.extras_keep_adding !== false)) {
    lines.push(`Amounts above full value ${after.extras_keep_adding === false ? 'cap' : 'keep adding'}`);
  }
  if (Boolean(before.floor_master) !== Boolean(after.floor_master)) {
    lines.push(`Shared floor ${after.floor_master ? 'on' : 'off'}`);
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
    if (inferInputKind(prev.unit, prev.input_kind) !== inferInputKind(activity.unit, activity.input_kind)) {
      lines.push(`${name} input ${inferInputKind(activity.unit, activity.input_kind)}`);
    }
    if (prev.multiplier.enabled !== activity.multiplier.enabled) {
      lines.push(`${name} multiplier ${activity.multiplier.enabled ? 'on' : 'off'}`);
    } else if (activity.multiplier.enabled) {
      if ((prev.multiplier.label ?? '') !== (activity.multiplier.label ?? '')) {
        lines.push(`${name} multiplier label ${prev.multiplier.label || '—'} → ${activity.multiplier.label || '—'}`);
      }
      if (JSON.stringify(prev.multiplier.tiers ?? []) !== JSON.stringify(activity.multiplier.tiers ?? [])) {
        lines.push(`${name} multiplier tiers changed`);
      }
      if (prev.multiplier.extra_factor !== activity.multiplier.extra_factor) {
        lines.push(
          `${name} extra-work factor ${prev.multiplier.extra_factor} → ${activity.multiplier.extra_factor}`,
        );
      }
    }
    if (prev.qualifiers.enabled !== activity.qualifiers.enabled) {
      lines.push(`${name} qualifiers ${activity.qualifiers.enabled ? 'on' : 'off'}`);
    } else if (
      activity.qualifiers.enabled &&
      prev.qualifiers.items.map((item) => item.label).join('|') !==
        activity.qualifiers.items.map((item) => item.label).join('|')
    ) {
      lines.push(`${name} qualifiers updated`);
    }
    if (
      Boolean(prev.floor?.enabled) !== Boolean(activity.floor?.enabled) ||
      Number(prev.floor?.min_qty ?? 0) !== Number(activity.floor?.min_qty ?? 0)
    ) {
      lines.push(`${name} floor changed`);
    }
  }
  for (const activity of before.activities) {
    if (!afterIds.has(activity.id)) {
      lines.push(`Removed ${activity.name.trim() || 'Untitled activity'}`);
    }
  }
  const beforeText = (before.text_fields ?? []).map((item) => item.label).join('|');
  const afterText = (after.text_fields ?? []).map((item) => item.label).join('|');
  if (beforeText !== afterText) {
    lines.push('Log text fields updated');
  }
  const beforeChoice = (before.choice_fields ?? []).map((item) => item.label).join('|');
  const afterChoice = (after.choice_fields ?? []).map((item) => item.label).join('|');
  if (beforeChoice !== afterChoice) {
    lines.push('Log choice fields updated');
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

function normalizeWord(value: string): string {
  return value.trim().toLowerCase();
}

/** “dials” vs “Dials” / “dial” — same word, do not print both. */
export function unitCollidesWithName(unit: string, name: string): boolean {
  const u = normalizeWord(unit);
  const n = normalizeWord(name);
  if (!u || !n) {
    return false;
  }
  if (u === n) {
    return true;
  }
  return u === `${n}s` || n === `${u}s`;
}

export function fullValueMultiplierThreshold(activity: ActivityConfig): number | null {
  if (!activity.multiplier.enabled) {
    return null;
  }
  const label = activity.multiplier.label?.trim();
  if (!label) {
    return null;
  }
  const tiers = multiplierTiers(activity);
  if (tiers.length === 0) {
    return null;
  }
  const full = [...tiers].reverse().find((tier) => tier.percent >= 100);
  if (full) {
    return full.threshold;
  }
  return tiers.reduce((best, tier) => (tier.threshold >= best.threshold ? tier : best)).threshold;
}

export function activityQtyPhrase(activity: ActivityConfig): string {
  const name = activity.name.trim();
  const kind = inferInputKind(activity.unit, activity.input_kind);
  if (kind === 'money') {
    return `${formatMoneySentenceAmount(activity.parity_qty)} of ${name}`;
  }
  if (unitCollidesWithName(activity.unit, name)) {
    return `${formatQty(activity.parity_qty)} ${name}`;
  }
  return `${activityQtyLabel(activity)} of ${name}`;
}

function joinSentenceParts(parts: string[]): string {
  if (parts.length === 0) {
    return '';
  }
  if (parts.length === 1) {
    return `${parts[0]}.`;
  }
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}.`;
}

export function activityScoresForLane(
  activity: Pick<ActivityConfig, 'lane_ids'>,
  laneId?: string | null,
): boolean {
  const ids = (activity.lane_ids ?? []).map((item) => item.trim()).filter(Boolean);
  if (ids.length === 0) {
    return true;
  }
  const lane = String(laneId ?? '').trim();
  return Boolean(lane) && ids.includes(lane);
}

export function scoringLaneLabel(
  config: Pick<ComparablePointsConfig, 'lanes'> | null | undefined,
  laneId?: string | null,
): string | null {
  const id = String(laneId ?? '').trim();
  if (!id) {
    return null;
  }
  return config?.lanes?.find((lane) => lane.id === id)?.label.trim() || null;
}

export function participantNeedsScoringLane(
  config: ComparablePointsConfig | null | undefined,
  laneId?: string | null,
): boolean {
  if (!config?.lanes?.length) {
    return false;
  }
  if (scoringLaneLabel(config, laneId)) {
    return false;
  }
  return filledComparableActivities(config).some((activity) => (activity.lane_ids?.length ?? 0) > 0);
}

function laneActorLabel(label: string): string {
  const text = label.trim();
  if (text.length <= 1 || /s$/i.test(text)) {
    return text;
  }
  return `${text}s`;
}

function joinActNames(names: string[]): string {
  if (names.length <= 1) {
    return names[0] ?? '';
  }
  if (names.length === 2) {
    return `${names[0]} and ${names[1]}`;
  }
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

function activityLaneName(activity: ActivityConfig): string {
  const name = activity.name.trim();
  const multiplier = activity.multiplier.enabled ? activity.multiplier.label?.trim() : '';
  return multiplier ? `${name} (with ${multiplier})` : name;
}

/** “Rookies score Dials (with Presentations) and AP. Veterans score AP only.” */
export function comparablePointsLaneSubline(config: ComparablePointsConfig): string {
  const lanes = config.lanes ?? [];
  if (lanes.length === 0) {
    return '';
  }
  const filled = filledComparableActivities(config);
  return lanes
    .map((lane) => {
      const names = filled
        .filter((activity) => activityScoresForLane(activity, lane.id))
        .map(activityLaneName)
        .filter(Boolean);
      const who = laneActorLabel(lane.label);
      if (names.length === 0) {
        return `${who} score nothing.`;
      }
      if (names.length === 1) {
        return `${who} score ${names[0]} only.`;
      }
      return `${who} score ${joinActNames(names)}.`;
    })
    .join(' ');
}

export function comparablePointsHeadline(config: ComparablePointsConfig): string {
  const count = filledComparableActivities(config).length || config.activities.length;
  return `${count} ${count === 1 ? 'activity' : 'activities'} · ${formatPoints(config.parity_points)} pts at full value`;
}

export function scoreWindowLabel(window: ScoreWindow | undefined): string {
  if (window === 'period') {
    return 'Each period';
  }
  if (window === 'day') {
    return 'Each day';
  }
  return 'This challenge';
}

export function comparablePointsLiveSentence(config: ComparablePointsConfig): string {
  const named = filledComparableActivities(config);
  const pts = `${formatPoints(config.parity_points)} points`;
  if (named.length === 0) {
    return 'Name an activity and set the quantity that equals full value.';
  }
  const parts = named.map((activity) => {
    const qty = activityQtyPhrase(activity);
    const threshold = fullValueMultiplierThreshold(activity);
    const label = activity.multiplier.label?.trim();
    const withMult =
      threshold != null && label ? `${qty} with ${formatQty(threshold)} ${label}` : qty;
    return `${withMult} equals ${pts}`;
  });
  return joinSentenceParts(parts);
}

export function comparableLogPreviewLines(config: ComparablePointsConfig): string[] {
  const lines: string[] = [];
  for (const field of comparableLogFields(config)) {
    if (field.kind === 'activity') {
      const money = field.inputKind === 'money' ? ' ($)' : '';
      lines.push(`${field.label}${money}`);
      continue;
    }
    if (field.kind === 'multiplier') {
      lines.push(field.label);
      continue;
    }
    if (field.kind === 'text') {
      lines.push(field.required ? `${field.label} (required)` : field.label);
      continue;
    }
    lines.push(`${field.label}: ${field.options.join(' / ')}`);
  }
  return lines;
}

function multiplierTiers(activity: ActivityConfig): ActivityMultiplierTier[] {
  return (activity.multiplier.tiers ?? [])
    .filter((tier) => Number.isFinite(tier.threshold) && Number.isFinite(tier.percent))
    .slice()
    .sort((left, right) => left.threshold - right.threshold || left.percent - right.percent);
}

export function resolveMultiplierPercent(activity: ActivityConfig, multiplierQty = 0): number {
  if (!activity.multiplier.enabled) {
    return 100;
  }
  const tiers = multiplierTiers(activity);
  if (tiers.length === 0) {
    return 100;
  }
  const amount = asQty(multiplierQty);
  let percent = 0;
  for (const tier of tiers) {
    if (amount + 1e-9 >= tier.threshold) {
      percent = tier.percent;
    }
  }
  return Math.max(0, percent);
}

function scoredQty(
  config: Pick<ComparablePointsConfig, 'extras_keep_adding'>,
  activity: ActivityConfig,
  qty: number,
): number {
  const amount = asQty(qty);
  if (activity.parity_qty <= 0) {
    return 0;
  }
  if (!extrasKeepAddingFor(activity, config)) {
    return Math.min(amount, activity.parity_qty);
  }
  return amount;
}

export function scoreSampleActivity(
  config: Pick<ComparablePointsConfig, 'parity_points' | 'extras_keep_adding'>,
  activity: ActivityConfig,
  qty: number,
  qualifierMet = true,
  multiplierQty = 0,
): number {
  if (activity.qualifiers.enabled && !qualifierMet) {
    return 0;
  }
  if (activity.floor?.enabled && asQty(qty) + 1e-9 < activity.floor.min_qty) {
    return 0;
  }
  const amount = scoredQty(config, activity, qty);
  if (activity.parity_qty <= 0 || amount <= 0) {
    return 0;
  }
  const base = (amount / activity.parity_qty) * config.parity_points;
  const usesTiers = activity.multiplier.enabled && multiplierTiers(activity).length > 0;
  if (!usesTiers) {
    return Math.round(base);
  }
  return Math.round((base * resolveMultiplierPercent(activity, multiplierQty)) / 100);
}

export function multiplierSourceQty(
  activity: ActivityConfig,
  totals: Record<string, number>,
): number {
  if (!activity.multiplier.enabled) {
    return 0;
  }
  const label = activity.multiplier.label?.trim() ?? '';
  const key = multiplierMetricKey(label);
  if (key && Number.isFinite(totals[key])) {
    return asQty(totals[key]);
  }
  if (label && Number.isFinite(totals[label])) {
    return asQty(totals[label]);
  }
  return 0;
}

export function scoreComparableWindow(
  config: ComparablePointsConfig,
  totals: Record<string, number>,
  laneId?: string | null,
): number {
  return filledComparableActivities(config).reduce((sum, activity) => {
    if (!activityScoresForLane(activity, laneId)) {
      return sum;
    }
    const qty = asQty(totals[activity.id]);
    return sum + scoreSampleActivity(config, activity, qty, true, multiplierSourceQty(activity, totals));
  }, 0);
}

export function comparableLogFields(config: ComparablePointsConfig): ComparableLogField[] {
  const fields: ComparableLogField[] = [];
  const seenMultiplier = new Set<string>();
  for (const activity of filledComparableActivities(config)) {
    fields.push({
      kind: 'activity',
      key: activity.id,
      label: activity.name.trim(),
      inputKind: inferInputKind(activity.unit, activity.input_kind),
      unit: activity.unit.trim(),
    });
    if (!activity.multiplier.enabled) {
      continue;
    }
    const label = activity.multiplier.label?.trim();
    if (!label) {
      continue;
    }
    const key = multiplierMetricKey(label);
    if (!key || seenMultiplier.has(key)) {
      continue;
    }
    seenMultiplier.add(key);
    fields.push({
      kind: 'multiplier',
      key,
      label,
      inputKind: 'count',
      unit: '',
    });
  }
  for (const field of config.text_fields ?? []) {
    if (!field.label.trim()) {
      continue;
    }
    fields.push({ ...emptyLogTextField(field), kind: 'text' });
  }
  const hideSelfServeLane = (config.lanes?.length ?? 0) > 0;
  for (const field of config.choice_fields ?? []) {
    if (!field.label.trim() || field.options.filter((item) => item.trim()).length < 1) {
      continue;
    }
    const label = field.label.trim().toLowerCase();
    if (hideSelfServeLane && (label === 'side' || label === 'lane')) {
      continue;
    }
    fields.push({ ...emptyLogChoiceField(field), kind: 'choice' });
  }
  return fields;
}

export function comparableBoardColumns(config: ComparablePointsConfig): ComparableBoardColumn[] {
  return comparableLogFields(config)
    .filter((field): field is ComparableLogNumericField => field.kind === 'activity' || field.kind === 'multiplier')
    .map((field) => ({
      key: field.key,
      label: field.label,
      money: field.inputKind === 'money',
    }));
}

export function shortComparableBoardLabel(label: string): string {
  const raw = String(label ?? '').trim();
  const key = raw.toLowerCase();
  if (key === 'presentations' || key === 'presentation') {
    return 'Pres';
  }
  if (key === 'points' || key === 'pts') {
    return 'Pts';
  }
  if (key === 'annual premium' || key === 'annualized premium') {
    return 'AP';
  }
  return raw;
}

export function formatComparableBoardCell(
  column: ComparableBoardColumn,
  totals: Record<string, number> | null | undefined,
): string {
  const amount = asQty(totals?.[column.key]);
  if (column.money) {
    return formatMoneySentenceAmount(amount);
  }
  return formatQty(amount);
}

export function parseMetricValues(value: unknown): Record<string, number> {
  const row = asRecord(value);
  if (!row) {
    return {};
  }
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(row)) {
    if (!key || key === LOG_CHOICES_PART_KEY) {
      continue;
    }
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 0) {
      out[key] = Math.round(n * 100) / 100;
    }
  }
  return out;
}

export function parseLogChoices(value: unknown): Record<string, string> {
  const row = asRecord(value);
  if (!row) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(row)) {
    const next = String(raw ?? '').trim();
    if (key && next) {
      out[key] = next;
    }
  }
  return out;
}

export function logChoicesFromProofParts(parts: unknown): Record<string, string> {
  const row = asRecord(parts);
  if (!row) {
    return {};
  }
  return parseLogChoices(row[LOG_CHOICES_PART_KEY] ?? row.log_choices);
}

export function comparableCheckinCaption(
  config: ComparablePointsConfig,
  textValues: Record<string, string>,
): string {
  const parts = (config.text_fields ?? [])
    .map((field) => String(textValues[field.id] ?? '').trim())
    .filter(Boolean);
  return parts.join('\n') || COMPARABLE_CHECKIN_EMPTY_CAPTION;
}

export function comparableRequiredTextMissing(
  config: ComparablePointsConfig,
  textValues: Record<string, string>,
): string | null {
  for (const field of config.text_fields ?? []) {
    if (field.required && !String(textValues[field.id] ?? '').trim()) {
      return field.label.trim() || 'This note';
    }
  }
  return null;
}
