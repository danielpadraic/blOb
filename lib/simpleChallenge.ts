import {
  asStartPreset,
  endsAtFromStartAndDays,
  inOneHour,
  resolveStartForPublish,
  startPresetFromValues,
  type StartPreset,
} from '@/lib/challengeSchedule';
import type { Challenge, ChallengeCategory } from '@/lib/types';
import { DEFAULT_CREATE_VALUES } from '@/lib/challengeTemplates';
import { milesToMeters, type DistanceUnit } from '@/lib/distance';
import { locationPlaceIsSet } from '@/lib/locationProof';
import {
  BEFORE_AFTER_HR_PRESET,
  SIMPLE_PROOF_CAP,
  defaultChallengeProofs,
  defaultSentenceForMethod,
  ensureProofSentence,
  firstProofMethod,
  makeProof,
  proofDistanceMeters,
  proofRequirementsFrom,
  proofTypeFromMethod,
  resolveChallengeProofs,
  type ChallengeProof,
  type ChallengeProofMethod,
} from '@/lib/challengeProofs';
import { resolveDiscoverability } from '@/lib/challengeDiscoverability';
import { extraTasksFromStored, filledExtraTasks } from '@/lib/challengeCreatePublish';
import { storedDurationDays } from '@/lib/challengeGoal';
import { isUnlimitedChallenge, normalizeFrequency, normalizeTasks } from '@/lib/challenges';
import { DEFAULT_MIN_MINUTES } from '@/lib/constants';
import type { CreateChallengeValues, ExtraCreateTask } from '@/utils/validators';
import { challengeRulesFromCreateValues } from '@/lib/challengeRuleCopy';
import { copy } from '@/lib/copy';
import { asPrivacyMode, type PrivacyMode } from '@/lib/privacyMode';

export type SimpleCurrency = 'coins' | 'bucks';
export type SimpleVisibility = 'public' | 'friends' | 'invite';
export type SimpleProof = ChallengeProofMethod;
export type SimpleFrequency = 'once' | 'daily' | '3x_week' | 'custom';
export type SimpleCustomPeriod = 'day' | 'week' | 'month' | 'duration';
export type SimpleDurationPreset = 1 | 7 | 30 | 'custom';
export type SimpleChallengeType =
  | 'any_exercise'
  | 'running'
  | 'lifting'
  | 'steps'
  | 'cycling'
  | 'hiit'
  | 'sports'
  | 'productivity'
  | 'custom';

export const SIMPLE_TYPES: {
  value: SimpleChallengeType;
  label: string;
  icon: string;
  category: ChallengeCategory;
  activity: string;
}[] = [
  { value: 'any_exercise', label: 'Any Exercise', icon: '', category: 'fitness', activity: 'any exercise' },
  { value: 'running', label: 'Running', icon: '🏃', category: 'fitness', activity: 'running' },
  { value: 'lifting', label: 'Lifting', icon: '🏋', category: 'fitness', activity: 'lifting' },
  { value: 'steps', label: 'Steps', icon: '👟', category: 'fitness', activity: 'walking' },
  { value: 'cycling', label: 'Cycling', icon: '🚴', category: 'fitness', activity: 'cycling' },
  { value: 'hiit', label: 'HIIT', icon: '⚡', category: 'fitness', activity: 'HIIT' },
  { value: 'sports', label: 'Sports', icon: '🏆', category: 'sports', activity: 'workout' },
  { value: 'productivity', label: 'Focus', icon: '🎯', category: 'productivity', activity: 'check-in' },
  { value: 'custom', label: 'Custom', icon: '✦', category: 'other', activity: 'custom' },
];

export const SIMPLE_DURATION_CHIPS: { value: SimpleDurationPreset; label: string }[] = [
  { value: 1, label: '1 day' },
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 'custom', label: 'Custom' },
];

export const SIMPLE_CUSTOM_PERIODS: { value: SimpleCustomPeriod; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'duration', label: 'Duration of challenge' },
];

export const SIMPLE_FREQUENCY_CHIPS: { value: SimpleFrequency; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Daily' },
  { value: '3x_week', label: '3×/week' },
  { value: 'custom', label: 'Custom' },
];

export const SIMPLE_PROOF_METHODS: { value: ChallengeProofMethod; label: string; icon: string }[] = [
  { value: 'photo', label: 'Photo', icon: '📷' },
  { value: 'video', label: 'Video', icon: '🎥' },
  { value: 'checkin', label: 'Note', icon: '✎' },
  { value: 'honor', label: 'Honor', icon: '🤝' },
  { value: 'hr', label: 'Heart rate', icon: '♥' },
  { value: 'distance', label: 'Distance', icon: '↔' },
  { value: 'location', label: 'Location', icon: '📍' },
];

export type SimpleHowYouWin = 'consistency' | 'cumulative';

export const SIMPLE_SCORING: { value: SimpleHowYouWin; label: string }[] = [
  { value: 'consistency', label: 'Consistency' },
  { value: 'cumulative', label: 'Cumulative' },
];

/** Leftover Simple drafts may still say points. Publish never does. */
export function isLeftoverSimplePointsDraft(draft: {
  scoring?: string | null;
} | null | undefined): boolean {
  return draft?.scoring === 'points';
}

export function simpleHowYouWin(draft: { scoring?: string | null } | null | undefined): SimpleHowYouWin {
  return draft?.scoring === 'cumulative' ? 'cumulative' : 'consistency';
}

export const SIMPLE_CUMULATIVE_WINDOWS: { value: 'challenge' | 'week'; label: string }[] = [
  { value: 'challenge', label: 'This challenge' },
  { value: 'week', label: 'Each week' },
];

export type SimpleChallengeDraft = {
  currency: SimpleCurrency;
  buy_in: number;
  host_budget: number;
  guarantee_enabled?: boolean;
  type: SimpleChallengeType;
  title: string;
  description: string;
  starts_at: string;
  start_preset: StartPreset;
  duration_preset: SimpleDurationPreset;
  duration_days: number;
  task: string;
  frequency: SimpleFrequency;
  custom_checkins: number;
  custom_period: SimpleCustomPeriod;
  proofs: ChallengeProof[];
  extra_tasks: ExtraCreateTask[];
  visibility: SimpleVisibility;
  privacy_mode: PrivacyMode;
  friends_of_friends: boolean;
  min_participants: number;
  cover_image_url: string;
  scoring?: 'consistency' | 'cumulative' | 'points';
  points_to_win?: number;
  cumulative_target_meters?: number;
  cumulative_window?: 'challenge' | 'week' | 'day';
  distance_unit?: 'mi' | 'km';
  allowed_misses?: number;
};

export function defaultSimpleDraft(now = new Date()): SimpleChallengeDraft {
  const starts = inOneHour(now);
  return {
    currency: 'coins',
    buy_in: 0,
    host_budget: 0,
    guarantee_enabled: true,
    type: 'any_exercise',
    title: '',
    description: '',
    starts_at: starts.toISOString(),
    start_preset: 'hour',
    duration_preset: 7,
    duration_days: 7,
    task: '',
    frequency: 'daily',
    custom_checkins: 7,
    custom_period: 'week',
    proofs: defaultChallengeProofs(),
    extra_tasks: [],
    visibility: 'public',
    privacy_mode: 'public',
    friends_of_friends: true,
    min_participants: 2,
    cover_image_url: '',
    scoring: 'consistency',
    points_to_win: 1,
    cumulative_target_meters: milesToMeters(100),
    cumulative_window: 'challenge',
    distance_unit: 'mi',
    allowed_misses: 0,
  };
}

function withProofSentences(draft: SimpleChallengeDraft): SimpleChallengeDraft {
  const privacy_mode = asPrivacyMode(draft.privacy_mode, draft.visibility, 'coins');
  return {
    ...draft,
    extra_tasks: Array.isArray(draft.extra_tasks) ? draft.extra_tasks : [],
    proofs: (draft.proofs ?? []).map((item) => ensureProofSentence(item, item.minutes ?? 30)),
    cover_image_url: draft.cover_image_url?.trim() || '',
    privacy_mode,
    guarantee_enabled:
      privacy_mode === 'private_corporate'
        ? draft.guarantee_enabled === true
        : draft.guarantee_enabled !== false,
    friends_of_friends: privacy_mode === 'private_corporate' ? false : draft.friends_of_friends,
    visibility: privacy_mode === 'private_corporate' ? 'invite' : draft.visibility,
  };
}

const SIMPLE_DRAFT_KEY = 'blob.simpleCreateDraft';
let simpleDraftMemory: { draft: SimpleChallengeDraft; savedAt: number } | null = null;

export function refreshSimpleDraftStart(draft: SimpleChallengeDraft, now = new Date()): SimpleChallengeDraft {
  const preset = draft.start_preset ?? startPresetFromValues(draft.starts_at, now);
  if (preset === 'custom') {
    return { ...draft, start_preset: 'custom' };
  }
  const resolved = resolveStartForPublish({
    preset,
    starts_at: draft.starts_at,
    duration_days: durationDaysOf(draft),
    now,
  });
  return { ...draft, start_preset: preset, starts_at: resolved.starts_at };
}

export function parseSimpleChallengeDraft(raw: unknown): SimpleChallengeDraft | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const base = defaultSimpleDraft();
  const type = SIMPLE_TYPES.some((item) => item.value === row.type)
    ? (row.type as SimpleChallengeType)
    : base.type;
  const currency: SimpleCurrency = row.currency === 'bucks' ? 'bucks' : 'coins';
  const visibility: SimpleVisibility =
    row.visibility === 'friends' || row.visibility === 'invite' ? row.visibility : 'public';
  const frequency: SimpleFrequency =
    row.frequency === 'once' || row.frequency === 'daily' || row.frequency === '3x_week' || row.frequency === 'custom'
      ? row.frequency
      : base.frequency;
  const custom_period: SimpleCustomPeriod =
    row.custom_period === 'day' ||
    row.custom_period === 'week' ||
    row.custom_period === 'month' ||
    row.custom_period === 'duration'
      ? row.custom_period
      : base.custom_period;
  const duration_preset: SimpleDurationPreset =
    row.duration_preset === 1 ||
    row.duration_preset === 7 ||
    row.duration_preset === 30 ||
    row.duration_preset === 'custom'
      ? row.duration_preset
      : row.duration_preset === '1'
        ? 1
        : row.duration_preset === '7'
          ? 7
          : row.duration_preset === '30'
            ? 30
            : base.duration_preset;
  const starts_at = typeof row.starts_at === 'string' && row.starts_at.trim() ? row.starts_at : base.starts_at;
  const start_preset = asStartPreset(row.start_preset) ?? startPresetFromValues(starts_at);
  const proofs = Array.isArray(row.proofs) && row.proofs.length > 0 ? (row.proofs as SimpleChallengeDraft['proofs']) : base.proofs;
  return withProofSentences({
    ...base,
    currency,
    buy_in: Math.max(Number(row.buy_in) || 0, 0),
    host_budget: Math.max(Number(row.host_budget) || 0, 0),
    guarantee_enabled: typeof row.guarantee_enabled === 'boolean' ? row.guarantee_enabled : base.guarantee_enabled,
    type,
    title: typeof row.title === 'string' ? row.title : base.title,
    description: typeof row.description === 'string' ? row.description : base.description,
    starts_at,
    start_preset,
    duration_preset,
    duration_days: Math.max(Number(row.duration_days) || base.duration_days, 1),
    task: typeof row.task === 'string' ? row.task : base.task,
    frequency,
    custom_checkins: Math.max(Number(row.custom_checkins) || base.custom_checkins, 1),
    custom_period,
    proofs,
    extra_tasks: Array.isArray(row.extra_tasks) ? (row.extra_tasks as SimpleChallengeDraft['extra_tasks']) : [],
    visibility,
    privacy_mode: asPrivacyMode(row.privacy_mode, visibility, 'coins'),
    friends_of_friends: row.friends_of_friends !== false,
    min_participants: Math.max(Number(row.min_participants) || 2, 2),
    cover_image_url: typeof row.cover_image_url === 'string' ? row.cover_image_url : '',
    scoring:
      row.scoring === 'cumulative' || row.scoring === 'points' || row.scoring === 'consistency'
        ? row.scoring
        : base.scoring,
    points_to_win: Math.max(Number(row.points_to_win) || 0, 0) || base.points_to_win,
    cumulative_target_meters: Math.max(Number(row.cumulative_target_meters) || 0, 0) || base.cumulative_target_meters,
    cumulative_window:
      row.cumulative_window === 'week' || row.cumulative_window === 'day' || row.cumulative_window === 'challenge'
        ? row.cumulative_window
        : base.cumulative_window,
    distance_unit: row.distance_unit === 'km' ? 'km' : base.distance_unit,
    allowed_misses: clampAllowedMisses(
      Number(row.allowed_misses ?? row.misses_allowed) || 0,
      {
        duration_preset,
        duration_days: Math.max(Number(row.duration_days) || base.duration_days, 1),
      },
    ),
  });
}

export function persistSimpleDraft(_draft?: SimpleChallengeDraft) {
  // Explicit Save Draft only. Session storage is not a draft source.
}

export function readPersistedSimpleDraft(_now = new Date()): SimpleChallengeDraft | null {
  return null;
}

export function clearPersistedSimpleDraft() {
  simpleDraftMemory = null;
  try {
    sessionStorage.removeItem(SIMPLE_DRAFT_KEY);
  } catch {
    // Ignore unavailable storage.
  }
}

export function durationDaysOf(draft: SimpleChallengeDraft): number {
  if (draft.duration_preset === 'custom') {
    return Math.max(Math.floor(draft.duration_days) || 1, 1);
  }
  return draft.duration_preset;
}

/** Stepper max: duration days, or 30 if custom days are not set yet. */
export function allowedMissesMax(
  draft: Pick<SimpleChallengeDraft, 'duration_preset' | 'duration_days'>,
): number {
  if (draft.duration_preset === 'custom') {
    const days = Math.floor(Number(draft.duration_days) || 0);
    return days > 0 ? days : 30;
  }
  return durationDaysOf(draft as SimpleChallengeDraft);
}

export function clampAllowedMisses(
  value: number,
  draft: Pick<SimpleChallengeDraft, 'duration_preset' | 'duration_days'>,
): number {
  const max = allowedMissesMax(draft);
  return Math.min(max, Math.max(0, Math.floor(Number(value) || 0)));
}

export function requiredCheckinsOf(draft: SimpleChallengeDraft): number {
  const days = durationDaysOf(draft);
  if (draft.frequency === 'once') {
    return 1;
  }
  if (draft.frequency === 'daily') {
    return days;
  }
  if (draft.frequency === '3x_week') {
    return Math.max(Math.ceil((days / 7) * 3), 1);
  }
  const n = Math.max(Math.floor(draft.custom_checkins) || 1, 1);
  if (draft.custom_period === 'day') {
    return n * days;
  }
  if (draft.custom_period === 'week') {
    return n * Math.max(Math.ceil(days / 7), 1);
  }
  if (draft.custom_period === 'month') {
    return n * Math.max(Math.ceil(days / 30), 1);
  }
  return n;
}

export function customFrequencyCopy(n: number, period: SimpleCustomPeriod): string {
  const count = Math.max(Math.floor(n) || 1, 1);
  if (period === 'day') {
    return `${count} each day`;
  }
  if (period === 'week') {
    return `${count} each week`;
  }
  if (period === 'month') {
    return `${count} each month`;
  }
  return `${count} over the whole challenge`;
}

export function frequencyHintOf(draft: SimpleChallengeDraft): string {
  const extra = filledExtraTasks(draft);
  if (draft.frequency === 'once') {
    return 'The task once for the whole challenge.';
  }
  if (draft.frequency === 'daily') {
    return extra.length > 0
      ? 'Every task, every day, unless a task is marked Once.'
      : 'The task once each day.';
  }
  if (draft.frequency === '3x_week') {
    return 'The task three times each week.';
  }
  return customFrequencyCopy(draft.custom_checkins, draft.custom_period);
}

function publishFrequencyOf(draft: SimpleChallengeDraft): CreateChallengeValues['frequency'] {
  if (draft.frequency === 'once') {
    return 'once';
  }
  if (draft.frequency === '3x_week') {
    return '3x_week';
  }
  if (draft.frequency === 'custom') {
    if (draft.custom_period === 'day' && draft.custom_checkins === 1) {
      return 'daily';
    }
    if (draft.custom_period === 'week' && draft.custom_checkins === 1) {
      return 'weekly';
    }
    if (draft.custom_period === 'week' && draft.custom_checkins === 3) {
      return '3x_week';
    }
    if (draft.custom_period === 'month') {
      return 'monthly';
    }
    return 'custom';
  }
  return 'daily';
}

function publishCadenceOf(draft: SimpleChallengeDraft): string {
  if (draft.frequency === 'custom') {
    if (draft.custom_period === 'day' && draft.custom_checkins === 1) {
      return 'daily';
    }
    if (draft.custom_period === 'week' && draft.custom_checkins === 1) {
      return 'weekly';
    }
    if (draft.custom_period === 'week' && draft.custom_checkins === 3) {
      return '3x_week';
    }
    if (draft.custom_period === 'month') {
      return 'monthly';
    }
    if (draft.custom_period === 'duration') {
      return draft.custom_checkins <= 1 ? 'once' : 'custom';
    }
  }
  return publishFrequencyOf(draft);
}

export function endsAtOf(draft: SimpleChallengeDraft): string {
  return endsAtFromStartAndDays(draft.starts_at, durationDaysOf(draft));
}

export function deviceTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function applyBeforeAfterHrPreset(): ChallengeProof[] {
  return BEFORE_AFTER_HR_PRESET.map((item) => makeProof(item.name, item.method, item.minutes));
}

export function addSimpleProof(proofs: ChallengeProof[]): ChallengeProof[] {
  if (proofs.length >= SIMPLE_PROOF_CAP) {
    return proofs;
  }
  return [...proofs, makeProof(defaultSentenceForMethod('photo'), 'photo')];
}

export function removeSimpleProof(proofs: ChallengeProof[], id: string): ChallengeProof[] {
  if (proofs.length <= 1) {
    return proofs;
  }
  return proofs.filter((item) => item.id !== id);
}

export function syncProofNameWithTask(
  proofs: ChallengeProof[],
  _previousTask: string,
  _nextTask: string,
): ChallengeProof[] {
  return proofs.map((item, index) => {
    if (index !== 0) {
      return item;
    }
    if (!item.name.trim() || item.name.trim() === copy('create.proofFallback')) {
      return { ...item, name: defaultSentenceForMethod(item.method) };
    }
    return item;
  });
}

export function simpleDraftToCreateValues(draft: SimpleChallengeDraft): CreateChallengeValues {
  const type = SIMPLE_TYPES.find((item) => item.value === draft.type) ?? SIMPLE_TYPES[0];
  const days = durationDaysOf(draft);
  const required = requiredCheckinsOf(draft);
  const bucks = draft.currency === 'bucks';
  const corporate = draft.privacy_mode === 'private_corporate';
  const invite = corporate || draft.visibility === 'invite';
  const buyIn = bucks || corporate ? 0 : Math.max(Number(draft.buy_in) || 0, 0);
  const hostContribution = Math.max(Number(draft.host_budget) || 0, 0);
  const fundingModel =
    buyIn > 0 && hostContribution > 0 ? 'hybrid' : hostContribution > 0 ? 'creator' : 'participants';
  const extra_tasks = filledExtraTasks(draft);
  let proofs = (draft.proofs.length > 0 ? draft.proofs : defaultChallengeProofs()).map((item) =>
    ensureProofSentence(item, item.minutes ?? DEFAULT_MIN_MINUTES),
  );
  const howYouWin = simpleHowYouWin(draft);
  if (howYouWin === 'cumulative' && !proofs.some((item) => item.method === 'distance')) {
    proofs = [
      makeProof(
        defaultSentenceForMethod('distance', 30, { unit: draft.distance_unit }),
        'distance',
        undefined,
        milesToMeters(1),
      ),
      ...proofs,
    ].slice(0, SIMPLE_PROOF_CAP);
  }
  const legacyTypes = proofRequirementsFrom(proofs).map((item) => item.type);
  const hrMinutes = [
    ...proofs.filter((item) => item.method === 'hr').map((item) => item.minutes ?? DEFAULT_MIN_MINUTES),
    ...extra_tasks.filter((item) => item.proof_method === 'hr').map((item) => item.hr_minutes),
  ];
  const minMinutes = hrMinutes.length > 0 ? Math.max(...hrMinutes, 1) : DEFAULT_MIN_MINUTES;
  const values: CreateChallengeValues = {
    ...DEFAULT_CREATE_VALUES,
    title: draft.title.trim(),
    description: draft.description.trim(),
    category: type.category,
    challenge_type: howYouWin,
    visibility: invite ? 'invite' : draft.visibility === 'friends' ? 'friends' : 'public',
    privacy_mode: corporate ? 'private_corporate' : asPrivacyMode(draft.privacy_mode, invite ? 'invite' : draft.visibility, 'coins'),
    discoverability: corporate
      ? 'invite_only'
      : resolveDiscoverability({
          visibility: invite ? 'invite' : draft.visibility,
          currency: draft.currency,
          friendsOfFriends: draft.friends_of_friends,
        }),
    challenge_lane: 'coins',
    buy_in: String(buyIn),
    duration_type: 'fixed',
    starts_at: draft.starts_at,
    ends_at: endsAtOf(draft),
    end_mode: 'length',
    duration_value: String(days),
    duration_unit: 'days',
    duration_days: String(days),
    target_count: String(required),
    frequency: publishFrequencyOf(draft),
    rule_activity: type.activity,
    points_to_win: '',
    extra_rules: [],
    extra_tasks,
    proofs: legacyTypes,
    challenge_proofs: proofs,
    tasks: DEFAULT_CREATE_VALUES.tasks,
    prize_structure: 'equal_split',
    funding_model: fundingModel,
    creator_contribution: String(hostContribution),
    participant_cap: 'unlimited',
    max_participants: '',
    min_participants: String(Math.max(Number(draft.min_participants) || 2, 2)),
    misses_allowed: String(
      simpleHowYouWin(draft) === 'cumulative' ? 0 : clampAllowedMisses(draft.allowed_misses ?? 0, draft),
    ),
    cumulative_metric: howYouWin === 'cumulative' ? 'distance_m' : null,
    cumulative_target:
      howYouWin === 'cumulative'
        ? String(Math.max(Number(draft.cumulative_target_meters) || milesToMeters(100), 1))
        : '',
    cumulative_window: draft.cumulative_window === 'week' || draft.cumulative_window === 'day' ? draft.cumulative_window : 'challenge',
    distance_meters_required: String(
      proofDistanceMeters(proofs.find((item) => item.method === 'distance')),
    ),
    proof_review: 'auto',
    proof_type: proofTypeFromMethod(firstProofMethod(proofs)) as CreateChallengeValues['proof_type'],
    task: draft.task.trim(),
    host_funded: bucks || hostContribution > 0,
    host_budget: String((draft.guarantee_enabled ?? false) ? hostContribution : 0),
    guarantee_enabled: draft.guarantee_enabled ?? !corporate,
    required_checkins: String(required),
    payout_mode: 'even_split_remaining',
    format: howYouWin,
    currency: bucks ? 'bucks' : 'coins',
    creator_participating: true,
    min_minutes: String(minMinutes),
    cover_image_url: draft.cover_image_url?.trim() || '',
    rules_video_url: '',
    rules: '',
  };
  values.rules = challengeRulesFromCreateValues({
    ...values,
    frequency: publishCadenceOf(draft),
  });
  return values;
}

export function simpleDraftFromChallenge(challenge: Challenge): SimpleChallengeDraft {
  const unlimited = isUnlimitedChallenge(challenge);
  let days = storedDurationDays(challenge) ?? 0;
  if (!days && !unlimited && challenge.starts_at && challenge.ends_at) {
    const start = Date.parse(challenge.starts_at);
    const end = Date.parse(challenge.ends_at);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start) {
      days = Math.max(1, Math.round((end - start) / (24 * 60 * 60 * 1000)));
    }
  }
  days = Math.min(365, Math.max(days || 7, 1));
  const duration_preset: SimpleDurationPreset = days === 1 || days === 7 || days === 30 ? days : 'custom';
  const freq = normalizeFrequency(challenge.frequency);
  const frequency: SimpleFrequency =
    freq === 'once' || freq === 'daily' || freq === '3x_week' ? freq : 'custom';
  const type =
    SIMPLE_TYPES.find((item) => item.activity === String(challenge.task ?? '').toLowerCase()) ??
    SIMPLE_TYPES.find((item) => item.category === challenge.category) ??
    SIMPLE_TYPES.find((item) => item.value === 'custom') ??
    SIMPLE_TYPES[0];
  const visibility: SimpleVisibility =
    challenge.visibility === 'friends'
      ? 'friends'
      : challenge.visibility === 'invite' || challenge.visibility === 'private'
        ? 'invite'
        : 'public';
  const privacy_mode = asPrivacyMode(challenge.privacy_mode, challenge.visibility, challenge.challenge_lane);
  return {
    currency: challenge.currency === 'bucks' ? 'bucks' : 'coins',
    buy_in:
      challenge.currency === 'bucks' ? 0 : Math.max(Number(challenge.buy_in_amount) || 0, 0),
    host_budget: Math.max(Number(challenge.creator_contribution) || 0, 0),
    guarantee_enabled: Math.max(Number(challenge.host_budget) || 0, 0) > 0,
    type: type.value,
    title: challenge.title,
    description: challenge.description ?? '',
    starts_at: challenge.starts_at,
    start_preset: startPresetFromValues(challenge.starts_at),
    duration_preset,
    duration_days: days,
    task: challenge.task ?? '',
    frequency,
    custom_checkins: Math.max(Number(challenge.required_checkins ?? challenge.target_count) || days, 1),
    custom_period: 'duration',
    proofs: resolveChallengeProofs({
      proofs: challenge.proofs,
      proof_type: challenge.proof_type,
      proof_requirements: challenge.proof_requirements,
      min_minutes: challenge.min_minutes,
    }),
    extra_tasks: extraTasksFromStored(normalizeTasks(challenge.tasks), challenge.task),
    visibility,
    privacy_mode,
    friends_of_friends:
      privacy_mode === 'private_corporate' ? false : challenge.discoverability === 'friends_of_friends',
    min_participants: Math.max(Number(challenge.min_participants) || 2, 2),
    cover_image_url: challenge.cover_image_url?.trim() || '',
    scoring:
      challenge.challenge_type === 'cumulative' || challenge.format === 'cumulative'
        ? 'cumulative'
        : 'consistency',
    points_to_win: 1,
    cumulative_target_meters: Math.max(Number(challenge.cumulative_target) || milesToMeters(100), 1),
    cumulative_window:
      challenge.cumulative_window === 'week' || challenge.cumulative_window === 'day'
        ? challenge.cumulative_window
        : 'challenge',
    distance_unit: 'mi' as DistanceUnit,
    allowed_misses: clampAllowedMisses(Number(challenge.misses_allowed) || 0, {
      duration_preset,
      duration_days: days,
    }),
  };
}

export function canRoundTripToSimple(values: {
  challenge_type?: string | null;
  format?: string | null;
  scoring_method?: string | null;
  challenge_lane?: string | null;
  duration_type?: string | null;
  extra_rules?: Array<{ text?: string | null }> | null;
  tasks?: Array<{ title?: string | null; points?: string | number | null }> | null;
}): boolean {
  if (values.challenge_type === 'points' || values.format === 'points' || values.format === 'lms') {
    return false;
  }
  if (values.scoring_method === 'comparable_points') {
    return false;
  }
  if (values.challenge_lane === 'private') {
    return false;
  }
  if (values.duration_type === 'unlimited') {
    return false;
  }
  if ((values.extra_rules ?? []).some((row) => String(row.text ?? '').trim())) {
    return false;
  }
  const named = (values.tasks ?? []).filter((task) => String(task.title ?? '').trim());
  if (named.length > 1 && named.some((task) => Number(task.points) > 0)) {
    return false;
  }
  return true;
}

/** Inverse of simpleDraftToCreateValues — create and edit share this mapping. */
export function createValuesToSimpleDraft(values: CreateChallengeValues): SimpleChallengeDraft {
  const base = defaultSimpleDraft();
  const days = Math.min(
    365,
    Math.max(Math.floor(Number(values.duration_days || values.duration_value) || 7), 1),
  );
  const duration_preset: SimpleDurationPreset = days === 1 || days === 7 || days === 30 ? days : 'custom';
  const freq = values.frequency;
  const frequency: SimpleFrequency =
    freq === 'once' || freq === 'daily' || freq === '3x_week' ? freq : 'custom';
  const visibility: SimpleVisibility =
    values.visibility === 'friends' ? 'friends' : values.visibility === 'invite' || values.visibility === 'private' ? 'invite' : 'public';
  const type =
    SIMPLE_TYPES.find((item) => item.activity === String(values.rule_activity ?? '').toLowerCase()) ??
    SIMPLE_TYPES.find((item) => item.category === values.category) ??
    SIMPLE_TYPES.find((item) => item.value === 'custom') ??
    SIMPLE_TYPES[0];
  const proofs =
    values.challenge_proofs && values.challenge_proofs.length > 0
      ? values.challenge_proofs
      : base.proofs;
  return withProofSentences({
    ...base,
    currency: values.currency === 'bucks' ? 'bucks' : 'coins',
    buy_in: values.currency === 'bucks' ? 0 : Math.max(Number(values.buy_in) || 0, 0),
    host_budget: Math.max(Number(values.creator_contribution) || 0, 0),
    guarantee_enabled: values.guarantee_enabled !== false && Math.max(Number(values.host_budget) || 0, 0) > 0,
    type: type.value,
    title: values.title?.trim() ?? '',
    description: values.description?.trim() ?? '',
    starts_at: values.starts_at || base.starts_at,
    start_preset: startPresetFromValues(values.starts_at || base.starts_at),
    duration_preset,
    duration_days: days,
    task: values.task?.trim() ?? '',
    frequency,
    custom_checkins: Math.max(Number(values.required_checkins ?? values.target_count) || days, 1),
    custom_period: frequency === 'custom' ? 'duration' : base.custom_period,
    proofs,
    extra_tasks: Array.isArray(values.extra_tasks) ? values.extra_tasks : [],
    visibility,
    privacy_mode: asPrivacyMode(values.privacy_mode, values.visibility, values.challenge_lane),
    friends_of_friends: values.discoverability === 'friends_of_friends',
    min_participants: Math.max(Number(values.min_participants) || 2, 2),
    cover_image_url: values.cover_image_url?.trim() || '',
    scoring: values.challenge_type === 'cumulative' || values.format === 'cumulative' ? 'cumulative' : 'consistency',
    points_to_win: 1,
    cumulative_target_meters: Math.max(Number(values.cumulative_target) || milesToMeters(100), 1),
    cumulative_window:
      values.cumulative_window === 'week' || values.cumulative_window === 'day' ? values.cumulative_window : 'challenge',
    distance_unit: 'mi',
    allowed_misses: clampAllowedMisses(Number(values.misses_allowed) || 0, { duration_preset, duration_days: days }),
  });
}

let advancedFromSimple: CreateChallengeValues | null = null;
let simpleFromAdvanced: SimpleChallengeDraft | null = null;

export function stageAdvancedFromSimple(draft: SimpleChallengeDraft) {
  advancedFromSimple = simpleDraftToCreateValues(draft);
}

export function peekAdvancedFromSimple(): CreateChallengeValues | null {
  return advancedFromSimple;
}

export function stageSimpleFromAdvanced(values: CreateChallengeValues) {
  simpleFromAdvanced = createValuesToSimpleDraft(values);
}

export function peekSimpleFromAdvanced(): SimpleChallengeDraft | null {
  return simpleFromAdvanced;
}

export function validateSimpleDraft(
  draft: SimpleChallengeDraft,
  options?: { allowStart?: string | null },
): string | null {
  if (!draft.title.trim() || draft.title.trim().length < 3) {
    return copy('create.needTitle');
  }
  if (!draft.starts_at) {
    return copy('create.needStart');
  }
  const start = new Date(draft.starts_at);
  const startOk =
    !Number.isNaN(start.getTime()) &&
    (start.getTime() > Date.now() || Boolean(options?.allowStart && draft.starts_at === options.allowStart));
  if (!startOk) {
    return copy('create.startFuture');
  }
  if (Math.max(Number(draft.min_participants) || 0, 0) < 2) {
    return copy('create.minToStartHint');
  }
  if (durationDaysOf(draft) < 1) {
    return copy('create.needDuration');
  }
  if (!draft.task.trim()) {
    return copy('create.needTask');
  }
  if ((draft.extra_tasks ?? []).some((item) => !item.title.trim())) {
    return copy('create.needExtraTask');
  }
  if (draft.frequency === 'custom' && requiredCheckinsOf(draft) < 1) {
    return copy('create.needCheckins');
  }
  if (draft.currency === 'bucks' && Math.max(Number(draft.buy_in) || 0, 0) > 0) {
    return 'The host funds the prize. Participants do not pay an entry.';
  }
  if (draft.proofs.some((proof) => proof.method === 'location' && !locationPlaceIsSet(proof.place))) {
    return 'Drop a pin for the Location proof.';
  }
  return null;
}
