import { differenceInCalendarDays, parseISO } from 'date-fns';

import {
  cloneTemplateValues,
  CREATE_WIZARD_STEPS,
  DEFAULT_CREATE_VALUES,
  wizardStepIndex,
  type ChallengeTemplateId,
  type CreateStartPath,
} from '@/lib/challengeTemplates';
import { comparablePointsFromChallenge, parseComparablePointsConfig } from '@/lib/comparablePoints';
import { asExtraRules, extraRulesFromStructured, parseRulesStructured } from '@/lib/consistencyRules';
import { CREATE_PROOF_TYPES, normalizeChallengeCategory } from '@/lib/constants';
import {
  isUnlimitedChallenge,
  normalizeChallenge,
  normalizeFrequency,
  normalizeFundingModel,
  normalizePrizeStructure,
  normalizeTasks,
  normalizeTopPlacesDistribution,
  normalizeTopPlacesMode,
} from '@/lib/challenges';
import { supabase } from '@/lib/supabase';
import type { Challenge } from '@/lib/types';
import { authStorage } from '@/lib/utils/secureStore';
import { MAX_CHALLENGE_DURATION_DAYS, asDurationUnit, asEndMode, ensureSchedule } from '@/lib/challengeSchedule';
import { extraTasksFromStored } from '@/lib/challengeCreatePublish';
import { emptyChallengeTask, type CreateChallengeValues, type ExtraCreateTask } from '@/utils/validators';

export type ChallengeDraft = {
  id: string | null;
  userId: string;
  title: string;
  step: number;
  startPath: CreateStartPath;
  templateId: ChallengeTemplateId | null;
  sourceChallengeId: string | null;
  values: CreateChallengeValues;
  updatedAt: string;
  corrupt?: boolean;
};

export type ReusableChallenge = Challenge & {
  relation: 'hosted' | 'joined';
};

const TEMPLATE_IDS: readonly ChallengeTemplateId[] = [
  'weekly_consistency',
  'last_man_standing',
  'family',
  'office',
  'skill_showdown',
  'custom',
];

const PROOF_SET = new Set<string>(CREATE_PROOF_TYPES);

function localKey(userId: string) {
  return `blob:challenge-draft:${userId}`;
}

const LAST_WIZARD_STEP = CREATE_WIZARD_STEPS.length - 1;
const WIZARD_STEP_KEYS: Record<string, number> = Object.fromEntries(
  CREATE_WIZARD_STEPS.map((item, index) => [item.key, index]),
);

function asStepIndex(value: unknown): number | null {
  if (typeof value === 'string') {
    const key = value.trim().toLowerCase();
    if (key in WIZARD_STEP_KEYS) {
      return WIZARD_STEP_KEYS[key];
    }
  }
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return null;
  }
  return Math.min(Math.floor(numeric), LAST_WIZARD_STEP);
}

function parseStoredWizardStep(step: unknown, stepKey?: unknown): number {
  const fromKey = asStepIndex(stepKey);
  if (fromKey != null) {
    return fromKey;
  }
  if (typeof step === 'string') {
    const fromString = asStepIndex(step);
    if (fromString != null) {
      return fromString;
    }
  }
  const numeric = typeof step === 'number' ? step : Number(step);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return Math.min(Math.floor(numeric) + 1, LAST_WIZARD_STEP);
}

export function clampDraftStep(step: unknown): number {
  return asStepIndex(step) ?? 0;
}

function firstIncompleteAfterStart(values: ChallengeDraft['values']): number {
  const title = typeof values?.title === 'string' ? values.title.trim() : '';
  const description = typeof values?.description === 'string' ? values.description.trim() : '';
  if (title.length >= 3 && description.length >= 8) {
    return wizardStepIndex('type');
  }
  return wizardStepIndex('goal');
}

/** Continue never lands on the Lane or Start chooser. */
export function resumeWizardStep(draft: Pick<ChallengeDraft, 'step' | 'values'>): number {
  const saved = clampDraftStep(draft.step);
  if (saved > wizardStepIndex('start')) {
    return saved;
  }
  return firstIncompleteAfterStart(draft.values);
}

function asStartPath(value: unknown): CreateStartPath {
  if (value === 'scratch' || value === 'template' || value === 'previous') {
    return value;
  }
  return null;
}

function asTemplateId(value: unknown): ChallengeTemplateId | null {
  if (typeof value === 'string' && TEMPLATE_IDS.includes(value as ChallengeTemplateId)) {
    return value as ChallengeTemplateId;
  }
  return null;
}

function asString(value: unknown, fallback: string): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function emptyValues(): CreateChallengeValues {
  return {
    ...DEFAULT_CREATE_VALUES,
    proofs: [...DEFAULT_CREATE_VALUES.proofs],
    extra_rules: DEFAULT_CREATE_VALUES.extra_rules.map((item) => ({ ...item, proofs: [...item.proofs] })),
    extra_tasks: [],
    tasks: DEFAULT_CREATE_VALUES.tasks.map((task) => ({
      ...task,
      proofs: [...(task.proofs ?? [])],
    })),
  };
}

function unwrapDraftRecord(raw: unknown): { row: Record<string, unknown>; corrupt: boolean } {
  try {
    if (raw == null) {
      return { row: {}, corrupt: false };
    }
    if (typeof raw === 'string') {
      const trimmed = raw.trim();
      if (!trimmed || trimmed === '{}') {
        return { row: {}, corrupt: false };
      }
      try {
        return unwrapDraftRecord(JSON.parse(trimmed) as unknown);
      } catch {
        return { row: {}, corrupt: true };
      }
    }
    if (typeof raw !== 'object' || Array.isArray(raw)) {
      return { row: {}, corrupt: true };
    }
    const obj = raw as Record<string, unknown>;
    const nested = obj.payload ?? obj.values;
    const looksLikeWrapper =
      nested != null && obj.title == null && obj.buy_in == null && obj.challenge_type == null;
    if (looksLikeWrapper) {
      return unwrapDraftRecord(nested);
    }
    return { row: obj, corrupt: false };
  } catch {
    return { row: {}, corrupt: true };
  }
}

function asProofs(value: unknown): CreateChallengeValues['proofs'] {
  const proofs = asOptionalProofs(value);
  return proofs.length > 0 ? proofs : [...DEFAULT_CREATE_VALUES.proofs];
}

function asOptionalProofs(value: unknown): CreateChallengeValues['proofs'] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    if (typeof item === 'string' && PROOF_SET.has(item)) {
      return [item as CreateChallengeValues['proofs'][number]];
    }
    if (item && typeof item === 'object') {
      const type = (item as { type?: unknown }).type;
      if (typeof type === 'string' && PROOF_SET.has(type)) {
        return [type as CreateChallengeValues['proofs'][number]];
      }
    }
    return [];
  });
}

function asExtraTasks(value: unknown): ExtraCreateTask[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item, index) => {
    if (!item || typeof item !== 'object') {
      return [];
    }
    const row = item as Record<string, unknown>;
    const title = asString(row.title, '');
    const id = asString(row.id, title.trim() ? `xtask-${index + 1}` : '');
    if (!title.trim() && !id) {
      return [];
    }
    const method = row.proof_method;
    const proof_method =
      method === 'photo' || method === 'video' || method === 'checkin' || method === 'honor' || method === 'hr'
        ? method
        : 'photo';
    return [
      {
        id: id || `xtask-${index + 1}`,
        title,
        once: Boolean(row.once),
        proof_method,
        hr_minutes: Math.max(Math.round(Number(row.hr_minutes) || 30), 1),
      },
    ];
  });
}

function asTasks(value: unknown): CreateChallengeValues['tasks'] {
  if (!Array.isArray(value) || value.length === 0) {
    return DEFAULT_CREATE_VALUES.tasks.map((task) => ({
      ...task,
      proofs: [...(task.proofs ?? [])],
    }));
  }
  return value.map((item, index) => {
    const task = item && typeof item === 'object' ? (item as Record<string, unknown>) : {};
    const proofs = asOptionalProofs(task.proofs ?? task.proof_types);
    const proofRequired = Boolean(task.proof_required) || proofs.length > 0;
    return {
      id: asString(task.id, `task-${index + 1}`),
      title: asString(task.title, ''),
      points: asString(task.points, '10'),
      proof_required: proofRequired,
      once: Boolean(task.once),
      proofs: proofs.length > 0 ? proofs : proofRequired ? (['photo'] as CreateChallengeValues['proofs']) : [],
    };
  });
}

export function hydrateDraftValues(raw: unknown): CreateChallengeValues {
  try {
    const { row } = unwrapDraftRecord(raw);
    const category = normalizeChallengeCategory(asString(row.category, DEFAULT_CREATE_VALUES.category));
    return {
      ...DEFAULT_CREATE_VALUES,
      title: asString(row.title, DEFAULT_CREATE_VALUES.title),
      description: asString(row.description, DEFAULT_CREATE_VALUES.description ?? ''),
      task: asString(row.task, DEFAULT_CREATE_VALUES.task ?? ''),
      category,
      challenge_type: row.challenge_type === 'points' ? 'points' : 'consistency',
      visibility:
        row.visibility === 'friends' || row.visibility === 'invite' || row.visibility === 'private'
          ? row.visibility
          : row.challenge_lane === 'private'
            ? 'invite'
            : 'public',
      privacy_mode:
        row.privacy_mode === 'private_corporate' || row.privacy_mode === 'private' || row.privacy_mode === 'public'
          ? row.privacy_mode
          : row.challenge_lane === 'private' ||
              row.visibility === 'private' ||
              row.visibility === 'invite'
            ? 'private'
            : 'public',
      challenge_lane: row.challenge_lane === 'private' ? 'private' : 'coins',
      duration_type: row.duration_type === 'unlimited' ? 'unlimited' : 'fixed',
      ...ensureSchedule({
        starts_at: asString(row.starts_at, ''),
        ends_at: asString(row.ends_at, ''),
        end_mode: asEndMode(row.end_mode),
        duration_value: asString(row.duration_value, asString(row.duration_days, DEFAULT_CREATE_VALUES.duration_days)),
        duration_unit: asDurationUnit(row.duration_unit),
        duration_days: asString(row.duration_days, DEFAULT_CREATE_VALUES.duration_days),
      }),
      target_count: asString(row.target_count, DEFAULT_CREATE_VALUES.target_count),
      frequency: normalizeFrequency(row.frequency),
      rule_activity: asString(row.rule_activity, DEFAULT_CREATE_VALUES.rule_activity) || DEFAULT_CREATE_VALUES.rule_activity,
      extra_rules: (() => {
        const stored = asExtraRules(row.extra_rules);
        if (stored.length > 0) {
          return stored;
        }
        return extraRulesFromStructured(parseRulesStructured(row.rules_structured ?? row.rules_list));
      })(),
      proofs: asProofs(row.proofs ?? row.proof_requirements),
      tasks: asTasks(row.tasks),
      extra_tasks: asExtraTasks(row.extra_tasks),
      prize_structure: normalizePrizeStructure(row.prize_structure),
      top_places_mode: normalizeTopPlacesMode(row.top_places_mode) ?? DEFAULT_CREATE_VALUES.top_places_mode,
      top_places_value: asString(row.top_places_value, DEFAULT_CREATE_VALUES.top_places_value),
      top_places_distribution:
        normalizeTopPlacesDistribution(row.top_places_distribution) ??
        DEFAULT_CREATE_VALUES.top_places_distribution,
      funding_model: normalizeFundingModel(row.funding_model),
      creator_contribution: asString(
        row.creator_contribution,
        DEFAULT_CREATE_VALUES.creator_contribution,
      ),
      participant_cap: row.participant_cap === 'limited' ? 'limited' : 'unlimited',
      max_participants: asString(row.max_participants, DEFAULT_CREATE_VALUES.max_participants),
      buy_in:
        row.challenge_lane === 'private'
          ? '0'
          : asString(row.buy_in, DEFAULT_CREATE_VALUES.buy_in),
      currency:
        row.challenge_lane === 'private'
          ? row.currency === 'bucks'
            ? 'bucks'
            : 'coins'
          : 'coins',
      creator_participating: (row.creator_participating ?? row.creator_participates) !== false,
      min_minutes: asString(row.min_minutes, DEFAULT_CREATE_VALUES.min_minutes),
      cover_image_url: asString(row.cover_image_url, ''),
      rules_video_url: asString(row.rules_video_url, ''),
      rules: asString(row.rules, ''),
      scoring_method: row.scoring_method === 'comparable_points' ? 'comparable_points' : null,
      scoring_config: parseComparablePointsConfig(row.scoring_config),
      guarantee_enabled:
        typeof row.guarantee_enabled === 'boolean'
          ? row.guarantee_enabled
          : row.privacy_mode !== 'private_corporate',
    };
  } catch {
    return emptyValues();
  }
}

export function valuesFromChallenge(challenge: Challenge): CreateChallengeValues {
  const comparable = comparablePointsFromChallenge(challenge);
  const unlimited = isUnlimitedChallenge(challenge);
  let durationDays = 7;
  if (!unlimited && challenge.starts_at && challenge.ends_at) {
    try {
      durationDays = differenceInCalendarDays(
        parseISO(challenge.ends_at),
        parseISO(challenge.starts_at),
      );
    } catch {
      durationDays = 7;
    }
  }
  durationDays = Math.min(MAX_CHALLENGE_DURATION_DAYS, Math.max(1, durationDays || 7));

  const structured = parseRulesStructured(challenge.rules_list);
  const proofs = (structured?.primary?.proof?.length
    ? structured.primary.proof
    : (challenge.proof_requirements ?? []).map((item) => item.type)
  ).filter((type): type is CreateChallengeValues['proofs'][number] => PROOF_SET.has(type));
  const tasks = normalizeTasks(challenge.tasks).map((task) => ({
    ...emptyChallengeTask(task.id),
    title: task.title,
    points: String(Math.max(task.points, 0) || 10),
    proof_required: Boolean(task.proof_required) || (task.proof_types?.length ?? 0) > 0,
    proofs:
      (task.proof_types ?? []).filter((type): type is CreateChallengeValues['proofs'][number] =>
        PROOF_SET.has(type),
      ).length > 0
        ? (task.proof_types ?? []).filter((type): type is CreateChallengeValues['proofs'][number] =>
            PROOF_SET.has(type),
          )
        : task.proof_required
          ? (['photo'] as CreateChallengeValues['proofs'])
          : [],
  }));
  const cap = challenge.max_participants;
  const primary = structured?.primary;

  return cloneTemplateValues({
    ...DEFAULT_CREATE_VALUES,
    title: challenge.title,
    task: challenge.task ?? '',
    min_participants: String(Math.max(Number(challenge.min_participants) || 2, 2)),
    misses_allowed: String(Math.max(Number(challenge.misses_allowed) || 0, 0)),
    proof_type:
      challenge.proof_type === 'video' || challenge.proof_type === 'check_in' || challenge.proof_type === 'honor'
        ? challenge.proof_type
        : 'photo',
    proof_review: challenge.proof_review === 'host' ? 'host' : 'auto',
    host_funded: Boolean(challenge.host_funded),
    host_budget: String(Math.max(Number(challenge.host_budget ?? challenge.creator_contribution) || 0, 0)),
    description: challenge.description ?? '',
    category: normalizeChallengeCategory(challenge.category, 'other'),
    challenge_type: challenge.challenge_type === 'points' ? 'points' : 'consistency',
    visibility:
      challenge.visibility === 'friends' ||
      challenge.visibility === 'invite' ||
      challenge.visibility === 'private'
        ? challenge.visibility
        : 'public',
    privacy_mode:
      challenge.privacy_mode === 'private_corporate' ||
      challenge.privacy_mode === 'private' ||
      challenge.privacy_mode === 'public'
        ? challenge.privacy_mode
        : challenge.challenge_lane === 'private' ||
            challenge.visibility === 'invite' ||
            challenge.visibility === 'private'
          ? 'private'
          : 'public',
    challenge_lane: challenge.challenge_lane === 'private' ? 'private' : 'coins',
    duration_type: 'fixed',
    ...ensureSchedule({
      starts_at: challenge.starts_at ?? '',
      ends_at: challenge.ends_at ?? '',
      end_mode: 'length',
      duration_value: String(durationDays),
      duration_unit: 'days',
      duration_days: String(durationDays),
    }),
    target_count: String(Math.max(Number(primary?.count ?? challenge.target_count) || 1, 1)),
    frequency: normalizeFrequency(primary?.period ?? challenge.frequency),
    rule_activity: primary?.activity?.trim() || DEFAULT_CREATE_VALUES.rule_activity,
    extra_rules: extraRulesFromStructured(structured),
    extra_tasks:
      challenge.challenge_type === 'points'
        ? []
        : extraTasksFromStored(normalizeTasks(challenge.tasks), challenge.task),
    proofs: proofs.length > 0 ? proofs : challenge.challenge_type === 'points' ? ['photo'] : [...DEFAULT_CREATE_VALUES.proofs],
    tasks:
      tasks.length > 0
        ? tasks
        : comparable?.activities
            .filter((activity) => activity.name.trim().length > 0)
            .map((activity) => ({
              ...emptyChallengeTask(),
              id: activity.id,
              title: activity.name,
              points: String(Math.max(Number(comparable.parity_points) || 1, 1)),
              proof_required: true,
              proofs: ['photo'] as CreateChallengeValues['proofs'],
            })) ?? [emptyChallengeTask()],
    prize_structure: normalizePrizeStructure(challenge.prize_structure),
    top_places_mode: normalizeTopPlacesMode(challenge.top_places_mode) ?? 'percent',
    top_places_value: String(challenge.top_places_value ?? 10),
    top_places_distribution: normalizeTopPlacesDistribution(challenge.top_places_distribution) ?? 'even',
    funding_model: normalizeFundingModel(challenge.funding_model),
    creator_contribution: String(Math.max(Number(challenge.creator_contribution) || 0, 0)),
    participant_cap: cap && cap > 0 ? 'limited' : 'unlimited',
    max_participants: cap && cap > 0 ? String(cap) : '20',
    buy_in: String(Math.max(Number(challenge.buy_in_amount) || 0, 0)),
    currency: challenge.currency === 'bucks' ? 'bucks' : 'coins',
    creator_participating: challenge.creator_participating !== false,
    min_minutes: String(Math.max(Number(challenge.min_minutes) || 30, 1)),
    cover_image_url: challenge.cover_image_url ?? '',
    rules_video_url: challenge.rules_video_url ?? '',
    rules: challenge.rules ?? '',
    scoring_method: challenge.scoring_method === 'comparable_points' || comparable
      ? 'comparable_points'
      : null,
    scoring_config: comparable,
    guarantee_enabled: Math.max(Number(challenge.host_budget) || 0, 0) > 0,
  });
}

const LANE_START_FIELDS = new Set<keyof CreateChallengeValues>([
  'challenge_lane',
  'visibility',
  'privacy_mode',
  'currency',
  'buy_in',
  'funding_model',
  'creator_contribution',
  'starts_at',
  'ends_at',
  'end_mode',
  'duration_value',
  'duration_unit',
  'duration_days',
]);

function stableValues(values: CreateChallengeValues): string {
  const hydrated = hydrateDraftValues(values);
  return JSON.stringify({ ...hydrated, rules: '' });
}

export function isDraftDirty(values: CreateChallengeValues, baseline: CreateChallengeValues): boolean {
  try {
    return stableValues(values) !== stableValues(baseline);
  } catch {
    return false;
  }
}

/** True when something other than lane/start chooser defaults (or auto-composed rules) changed. */
export function hasMeaningfulDraftEdits(
  values: CreateChallengeValues,
  baseline: CreateChallengeValues = DEFAULT_CREATE_VALUES,
): boolean {
  try {
    const current = hydrateDraftValues(values);
    const origin = hydrateDraftValues(baseline);
    for (const key of Object.keys(current) as (keyof CreateChallengeValues)[]) {
      if (key === 'rules' || LANE_START_FIELDS.has(key)) {
        continue;
      }
      if (JSON.stringify(current[key]) !== JSON.stringify(origin[key])) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export function isDraftWorthSaving(draft: Pick<ChallengeDraft, 'step' | 'startPath' | 'values'>): boolean {
  try {
    const step = clampDraftStep(draft.step);
    if (step < wizardStepIndex('goal')) {
      return hasMeaningfulDraftEdits(draft.values);
    }
    return hasMeaningfulDraftEdits(draft.values) || isDraftDirty(draft.values, DEFAULT_CREATE_VALUES);
  } catch {
    return false;
  }
}

export function isVisibleDraft(draft: ChallengeDraft): boolean {
  if (draft.corrupt) {
    return true;
  }
  if (clampDraftStep(draft.step) < wizardStepIndex('goal')) {
    return false;
  }
  const title = typeof draft.values?.title === 'string' ? draft.values.title.trim() : '';
  return Boolean(title) || hasMeaningfulDraftEdits(draft.values);
}

export function draftPreviewLabel(draft: ChallengeDraft): string {
  if (draft.corrupt) {
    return 'This draft can’t be opened';
  }
  const title = typeof draft.values?.title === 'string' ? draft.values.title.trim() : '';
  const step = CREATE_WIZARD_STEPS[draft.step];
  const stepLabel = step ? `Step ${draft.step + 1} · ${step.label}` : `Step ${draft.step + 1}`;
  return title ? `${title} · ${stepLabel}` : stepLabel;
}

let loggedDraftOnce = false;

function logDraftOnce(row: unknown, draft: ChallengeDraft) {
  if (!__DEV__ || loggedDraftOnce) {
    return;
  }
  loggedDraftOnce = true;
  console.log('[blob:draft] loaded row', row);
  console.log('[blob:draft] hydrated', draft);
}

function fallbackDraft(userId: string, corrupt = true): ChallengeDraft {
  const values = emptyValues();
  return {
    id: null,
    userId,
    title: '',
    step: 0,
    startPath: null,
    templateId: null,
    sourceChallengeId: null,
    values,
    updatedAt: new Date().toISOString(),
    corrupt,
  };
}

function draftTitle(values: CreateChallengeValues, fallback = ''): string {
  const title = typeof values.title === 'string' ? values.title.trim() : '';
  return title || fallback;
}

function wizardMeta(
  values: CreateChallengeValues,
  draft: Pick<ChallengeDraft, 'step' | 'startPath' | 'templateId' | 'sourceChallengeId'>,
): Record<string, unknown> {
  return {
    ...values,
    step: draft.step,
    step_key: CREATE_WIZARD_STEPS[draft.step]?.key,
    start_path: draft.startPath,
    template_id: draft.templateId,
    source_challenge_id: draft.sourceChallengeId,
  };
}

function isSchemaMismatch(message: string): boolean {
  const text = message.toLowerCase();
  return (
    text.includes('does not exist') ||
    text.includes('schema cache') ||
    text.includes('could not find') ||
    text.includes('column')
  );
}

export function parseChallengeDraft(userId: string, row: unknown): ChallengeDraft {
  try {
    const rec = row && typeof row === 'object' && !Array.isArray(row) ? (row as Record<string, unknown>) : {};
    const payload = rec.payload ?? rec.values ?? rec;
    const unwrapped = unwrapDraftRecord(payload);
    const nested = unwrapped.row;
    const sourceId = rec.source_challenge_id ?? rec.sourceChallengeId ?? nested.source_challenge_id;
    const id = typeof rec.id === 'string' && rec.id ? rec.id : null;
    const values = hydrateDraftValues(nested);
    const title = asString(rec.title, draftTitle(values));
    const draft: ChallengeDraft = {
      id,
      userId,
      title,
      step: parseStoredWizardStep(
        rec.step ?? rec.wizard_step ?? nested.step ?? nested.wizard_step,
        rec.step_key ?? nested.step_key,
      ),
      startPath: asStartPath(rec.start_path ?? rec.startPath ?? nested.start_path),
      templateId: asTemplateId(rec.template_id ?? rec.templateId ?? nested.template_id),
      sourceChallengeId: typeof sourceId === 'string' && sourceId ? sourceId : null,
      values,
      updatedAt: asString(rec.updated_at ?? rec.updatedAt, new Date().toISOString()),
      corrupt: unwrapped.corrupt,
    };
    logDraftOnce(row, draft);
    return draft;
  } catch {
    const draft = fallbackDraft(userId, true);
    logDraftOnce(row, draft);
    return draft;
  }
}

async function readLocalDraft(userId: string): Promise<ChallengeDraft | null> {
  try {
    const raw = await authStorage.getItem(localKey(userId));
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as unknown;
    return parseChallengeDraft(userId, parsed);
  } catch {
    return null;
  }
}

async function writeLocalDraft(draft: ChallengeDraft): Promise<void> {
  await authStorage.setItem(
    localKey(draft.userId),
    JSON.stringify({
      id: draft.id,
      title: draft.title,
      step: draft.step,
      step_key: CREATE_WIZARD_STEPS[draft.step]?.key,
      start_path: draft.startPath,
      template_id: draft.templateId,
      source_challenge_id: draft.sourceChallengeId,
      payload: wizardMeta(draft.values, draft),
      updated_at: draft.updatedAt,
    }),
  );
}

async function clearLocalDraft(userId: string): Promise<void> {
  await authStorage.removeItem(localKey(userId));
}

async function fetchOwnerDrafts(userId: string): Promise<ChallengeDraft[] | null> {
  const remote = await supabase
    .from('challenge_drafts')
    .select('id, owner_id, title, payload, updated_at')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false });
  if (!remote.error && remote.data) {
    return remote.data
      .map((row) => parseChallengeDraft(userId, row))
      .filter(isVisibleDraft);
  }
  if (remote.error && isSchemaMismatch(remote.error.message ?? '')) {
    return null;
  }
  if (remote.error) {
    console.log('[blob:draft] owner list skipped', remote.error.message);
    return null;
  }
  return [];
}

async function fetchLegacyDraft(userId: string): Promise<ChallengeDraft | null> {
  const remote = await supabase
    .from('challenge_drafts')
    .select('user_id, step, start_path, template_id, source_challenge_id, payload, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (!remote.error && remote.data) {
    return parseChallengeDraft(userId, remote.data);
  }
  return null;
}

export async function fetchChallengeDrafts(userId: string): Promise<ChallengeDraft[]> {
  const owner = await fetchOwnerDrafts(userId);
  if (owner) {
    if (owner.length > 0) {
      return owner;
    }
    const local = await readLocalDraft(userId);
    return local && !local.id && isVisibleDraft(local) ? [local] : [];
  }
  const legacy = await fetchLegacyDraft(userId);
  if (legacy && isVisibleDraft(legacy)) {
    return [legacy];
  }
  const local = await readLocalDraft(userId);
  return local && isVisibleDraft(local) ? [local] : [];
}

export async function fetchChallengeDraft(userId: string): Promise<ChallengeDraft | null> {
  const drafts = await fetchChallengeDrafts(userId);
  return drafts[0] ?? null;
}

function asDraftId(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

async function saveOwnerDraft(draft: ChallengeDraft): Promise<ChallengeDraft | null> {
  const payload = wizardMeta(draft.values, draft);
  const row = {
    owner_id: draft.userId,
    title: draft.title || 'Untitled draft',
    payload,
    updated_at: draft.updatedAt,
  };
  const draftId = asDraftId(draft.id);
  const drafts = supabase.from('challenge_drafts');

  if (draftId) {
    const updated = await drafts.update(row).eq('id', draftId).select('id').maybeSingle();
    if (!updated.error) {
      return { ...draft, id: asDraftId(updated.data?.id) ?? draftId };
    }
    const message = updated.error.message ?? '';
    if (!isSchemaMismatch(message) && !message.toLowerCase().includes('id')) {
      console.log('[blob:draft] owner update skipped', message);
      return null;
    }
  }

  const inserted = await drafts.insert(row).select('id').maybeSingle();
  if (!inserted.error) {
    return { ...draft, id: asDraftId(inserted.data?.id) ?? draftId };
  }

  const insertMessage = inserted.error.message ?? '';
  const canUpsert =
    isSchemaMismatch(insertMessage) ||
    insertMessage.toLowerCase().includes('duplicate') ||
    insertMessage.toLowerCase().includes('unique') ||
    insertMessage.toLowerCase().includes('on conflict');
  if (!canUpsert) {
    console.log('[blob:draft] owner insert skipped', insertMessage);
    return null;
  }

  const upserted = await supabase
    .from('challenge_drafts')
    .upsert(row, { onConflict: 'owner_id' })
    .select('id')
    .maybeSingle();
  if (!upserted.error) {
    return { ...draft, id: asDraftId(upserted.data?.id) ?? draftId };
  }

  console.log('[blob:draft] owner upsert skipped', upserted.error.message);
  return null;
}

async function saveLegacyDraft(draft: ChallengeDraft): Promise<void> {
  const { error } = await supabase.from('challenge_drafts').upsert(
    {
      user_id: draft.userId,
      step: draft.step,
      start_path: draft.startPath,
      template_id: draft.templateId,
      source_challenge_id: draft.sourceChallengeId,
      payload: wizardMeta(draft.values, draft) as unknown as Record<string, unknown>,
      updated_at: draft.updatedAt,
    },
    { onConflict: 'user_id' },
  );
  if (error) {
    console.log('[blob:draft] remote save skipped', error.message);
  }
}

export async function saveChallengeDraft(draft: ChallengeDraft): Promise<ChallengeDraft> {
  const values = hydrateDraftValues(draft.values);
  let next: ChallengeDraft = {
    ...draft,
    id: asDraftId(draft.id),
    step: clampDraftStep(draft.step),
    values,
    title: draftTitle(values, draft.title || 'Untitled draft'),
    updatedAt: new Date().toISOString(),
  };
  await writeLocalDraft(next);
  const owner = await saveOwnerDraft(next);
  if (owner) {
    next = owner;
    await writeLocalDraft(next);
    return next;
  }
  await saveLegacyDraft(next);
  return next;
}

export async function discardChallengeDraft(userId: string, draftId?: string | null): Promise<void> {
  const local = await readLocalDraft(userId);
  if (!draftId || !local?.id || local.id === draftId) {
    await clearLocalDraft(userId);
  }
  if (draftId) {
    const byId = await supabase.from('challenge_drafts').delete().eq('id', draftId);
    if (!byId.error) {
      return;
    }
    if (!isSchemaMismatch(byId.error.message ?? '')) {
      throw byId.error;
    }
  }
  const byOwner = await supabase.from('challenge_drafts').delete().eq('owner_id', userId);
  if (!byOwner.error) {
    return;
  }
  const byUser = await supabase.from('challenge_drafts').delete().eq('user_id', userId);
  if (byUser.error && !isSchemaMismatch(byUser.error.message ?? '')) {
    throw byUser.error;
  }
}

const REUSE_COLUMNS =
  'id, title, description, rules, is_official, created_by, buy_in_amount, days_required, min_minutes, proof_requirements, status, starts_at, ends_at, prize_pool, prize_structure, top_places_mode, top_places_value, top_places_distribution, funding_model, creator_contribution, max_participants, is_unlimited, category, challenge_type, visibility, frequency, target_count, tasks, created_at, updated_at, currency, creator_participating, cover_image_url, rules_video_url';

export async function fetchReusableChallenges(userId: string): Promise<ReusableChallenge[]> {
  const hostedResult = await supabase
    .from('challenges')
    .select(REUSE_COLUMNS)
    .eq('created_by', userId)
    .order('updated_at', { ascending: false })
    .limit(8);

  const hosted = (hostedResult.data ?? [])
    .map((row) => normalizeChallenge(row as Record<string, unknown>))
    .filter((challenge) => !challenge.is_official)
    .map((challenge) => ({ ...challenge, relation: 'hosted' as const }));

  const parts = await supabase
    .from('challenge_participants')
    .select('challenge_id, joined_at')
    .eq('user_id', userId)
    .order('joined_at', { ascending: false })
    .limit(12);

  const hostedIds = new Set(hosted.map((item) => item.id));
  const joinedIds = (parts.data ?? [])
    .map((row) => String((row as { challenge_id?: string }).challenge_id ?? ''))
    .filter((id) => id && !hostedIds.has(id));

  let joined: ReusableChallenge[] = [];
  if (joinedIds.length > 0) {
    const joinedResult = await supabase
      .from('challenges')
      .select(REUSE_COLUMNS)
      .in('id', joinedIds);
    const byId = new Map(
      (joinedResult.data ?? []).map((row) => {
        const challenge = normalizeChallenge(row as Record<string, unknown>);
        return [challenge.id, challenge] as const;
      }),
    );
    joined = joinedIds
      .map((id) => byId.get(id))
      .filter((item): item is Challenge => Boolean(item))
      .map((challenge) => ({ ...challenge, relation: 'joined' as const }));
  }

  return [...hosted, ...joined].slice(0, 8);
}
